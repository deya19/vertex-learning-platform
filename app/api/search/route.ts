import {auth} from '@clerk/nextjs/server'
import {openai} from '@ai-sdk/openai'
import {NoOutputGeneratedError, Output, generateText, stepCountIs} from 'ai'
import type {MCPClient} from '@ai-sdk/mcp'
import {z} from 'zod'

import {captureServerEvent} from '../../../lib/posthog-server'
import {serverClient} from '../../../sanity/lib/client'
import {createSearchContext, disposeSearchContext} from '../../../sanity/lib/search-context'

export const runtime = 'nodejs'

function positiveEnvInt(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] || '', 10)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

const SEARCH_RATE_LIMIT_MAX = positiveEnvInt('SEARCH_RATE_LIMIT_MAX', 20)
const SEARCH_RATE_LIMIT_WINDOW_MS = positiveEnvInt('SEARCH_RATE_LIMIT_WINDOW_MS', 60000)
const SEARCH_TIMEOUT_MS = positiveEnvInt('SEARCH_TIMEOUT_MS', 30000)
const searchRateLimits = new Map<string, {count: number; resetAt: number}>()

const LESSON_LOOKUP_PROJECTION = /* groq */ `
    _id, title, "lessonSlug": slug.current, description,
    duration, keyPoints, videoUrl,
    "posterUrl": coalesce(poster, thumbnail).asset->url,
    "courses": *[_type == "course" && references(^._id)] {
      _id, title, "courseSlug": slug.current,
      modules[]{title, lessons[]->{_id}}
    }
  `

const SEARCH_RESULT_LOOKUP_QUERY = /* groq */ `
  *[_type == "lesson" && slug.current in $lessonSlugs] {
    ${LESSON_LOOKUP_PROJECTION}
  }
`

type SearchLesson = {
  _id: string
  title: string
  lessonSlug: string
  description?: string
  duration: number
  keyPoints?: string[]
  videoUrl: string
  posterUrl?: string
  notesText?: string
  courses: { _id: string; title: string; courseSlug: string; modules: {title: string; lessons: {_id: string}[]}[] }[]
}

type SearchCandidate = {
  kind: 'lesson' | 'video'
  lessonSlug: string
  courseSlug?: string
  matchedSeconds?: number
  matchedLabel?: string
}

const SEARCH_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'you', 'your', 'how', 'what', 'when', 'where', 'that', 'this', 'from', 'into', 'about',
  'are', 'can', 'get', 'use', 'using', 'does', 'do', 'did', 'why', 'which', 'who', 'will', 'would', 'there', 'their',
  'have', 'has', 'had', 'was', 'were', 'been', 'being', 'out', 'all', 'any', 'not', 'but', 'its', "it's", 'off',
])

function tokenizeQuery(query: string) {
  const tokens = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !SEARCH_STOPWORDS.has(token))
  return [...new Set(tokens)].slice(0, 8)
}

function buildTokenParams(tokens: string[]) {
  return Object.fromEntries(tokens.map((token, index) => [`t${index}`, `*${token}*`]))
}

function tokenConditions(tokens: string[], fields: string[]) {
  return tokens
    .map((_, index) => `(${fields.map((field) => `${field} match $t${index}`).join(' || ')})`)
    .join(' || ')
}

function countTokenHits(text: string, tokens: string[]) {
  if (!text) return 0
  const lower = text.toLowerCase()
  return tokens.reduce((count, token) => (lower.includes(token) ? count + 1 : count), 0)
}

function scoreLesson(lesson: SearchLesson, tokens: string[]) {
  const titleHits = countTokenHits(lesson.title, tokens)
  const summaryHits = countTokenHits(`${lesson.description ?? ''} ${(lesson.keyPoints ?? []).join(' ')}`, tokens)
  const notesHits = countTokenHits(lesson.notesText ?? '', tokens)
  return titleHits * 3 + summaryHits * 2 + notesHits
}

function getRequestKey(request: Request) {
  return request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
}

function isRateLimited(request: Request) {
  const now = Date.now()
  const key = getRequestKey(request)
  const current = searchRateLimits.get(key)
  if (!current || current.resetAt <= now) {
    searchRateLimits.set(key, {count: 1, resetAt: now + SEARCH_RATE_LIMIT_WINDOW_MS})
    if (searchRateLimits.size > 10000) {
      for (const [entryKey, entry] of searchRateLimits) if (entry.resetAt <= now) searchRateLimits.delete(entryKey)
    }
    return null
  }
  current.count += 1
  return current.count > SEARCH_RATE_LIMIT_MAX ? Math.ceil((current.resetAt - now) / 1000) : null
}

function boundedHeader(request: Request, name: string) {
  const value = request.headers.get(name)?.trim()
  return value && value.length <= 200 ? value : null
}

async function getAnalyticsIdentity(request: Request) {
  let userId: string | null = null
  try {
    userId = (await auth()).userId
  } catch {
    userId = null
  }
  return {
    distinctId: userId || boundedHeader(request, 'x-posthog-distinct-id') || `server-${crypto.randomUUID()}`,
    isAuthenticated: Boolean(userId),
    sessionId: boundedHeader(request, 'x-posthog-session-id'),
  }
}

const searchRequestSchema = z.object({query: z.string().trim().min(2).max(200)})

const searchResultSchema = z.object({
  kind: z.enum(['video', 'lesson']),
  lessonSlug: z.string().min(1),
  lessonTitle: z.string().min(1),
  courseSlug: z.string().min(1),
  courseTitle: z.string().min(1),
  moduleTitle: z.string().min(1),
  moduleIndex: z.number().int().nonnegative(),
  lessonIndex: z.number().int().nonnegative(),
  description: z.string().min(1),
  matchedSeconds: z.number().nonnegative().nullable(),
  matchedLabel: z.string().min(1).nullable(),
  duration: z.number().nonnegative().nullable(),
  posterUrl: z.string().nullable(),
  keyPoints: z.array(z.string()).max(8),
})

const searchResponseSchema = z.object({
  total: z.number().int().nonnegative(),
  courseCount: z.number().int().nonnegative(),
  results: z.array(searchResultSchema),
})

type SearchApiResult = {
  lessonSlug: string
  lessonTitle: string
  courseSlug: string
  courseTitle: string
  moduleTitle: string
  moduleIndex: number
  lessonIndex: number
  description: string
} & ({kind: 'lesson'; keyPoints: string[]; href: string} | {kind: 'video'; matchedSeconds: number; matchedLabel: string; duration: number; posterUrl?: string; href: string})

const SEARCH_SYSTEM_PROMPT = `You are Vertex's grounded course search agent. Search Sanity using the available Context MCP groq_query tool and return only the requested structured output.

Search both lesson topics and video moments. Lessons are nested as references inside course.modules[].lessons[]; lesson notes are Portable Text, so use pt::text(notes) for text matching. Video documents are internal lookup documents keyed by video URL. For video results, match chapters first and use transcript chunks only when no chapter matches. Never return a video document as a result by itself, never return a whole transcript or chunks array, and always tie a video moment to the lesson that references the same video URL.

Prefer one comprehensive GROQ query that gathers everything you need; use at most two queries, then immediately return the structured output. Keep every GROQ response small. Never query complete documents or unrestricted arrays. Project only fields required by the output schema. Filter chapters and chunks inside GROQ before projecting them and return at most five matching chapters or chunks per video. Do not request notes bodies, full chapters arrays, or full transcript arrays in query results.

Use token-based matching: wildcard each meaningful keyword and OR the terms; never match a whole natural-language phrase as one pattern. Rank exact title/concept matches ahead of broad matches. Return every relevant result, not an arbitrary handful. Ground every title, slug, count, timestamp, duration, and description in query results. For lesson results, set video-only fields to null and keyPoints to the stored lesson key points. For video results, set keyPoints to an empty array and populate every video field. If there are no matches, return total 0, courseCount 0, and an empty results array. Do not invent data. Do not use semanticSimilarity unless the Context endpoint explicitly supports it.`

function isSanityAssetUrl(value: string | null) {
  return value?.startsWith('https://cdn.sanity.io/') ? value : undefined
}

function isNoOutputGeneratedError(error: unknown) {
  return NoOutputGeneratedError.isInstance(error) || (error instanceof Error && error.name === 'AI_NoOutputGeneratedError')
}

function isTimeoutError(error: unknown) {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
}

type McpTool = Awaited<ReturnType<MCPClient['tools']>>[string]

async function runAgentSearch(
  query: string,
  systemContext: string,
  groqQueryTool: McpTool,
  signal: AbortSignal,
): Promise<{total: number; courseCount: number; results: z.infer<typeof searchResultSchema>[]}> {
  const result = await generateText({
    model: openai(process.env.OPENAI_MODEL || 'gpt-4o-mini'),
    system: systemContext,
    prompt: `Find all relevant course and lesson results for this learner query: ${query}`,
    tools: {groq_query: groqQueryTool},
    stopWhen: stepCountIs(8),
    output: Output.object({schema: searchResponseSchema}),
    abortSignal: signal,
  })
  return result.output ?? {total: 0, courseCount: 0, results: []}
}

async function runFallbackSearch(query: string): Promise<{candidates: SearchCandidate[]; lessonsBySlug: Map<string, SearchLesson>}> {
  const tokens = tokenizeQuery(query)
  if (tokens.length === 0) return {candidates: [], lessonsBySlug: new Map()}

  const params = buildTokenParams(tokens)
  const lessons = await serverClient.fetch<SearchLesson[]>(
    /* groq */ `*[_type == "lesson" && (${tokenConditions(tokens, ['title', 'description', 'keyPoints', 'pt::text(notes)'])})] {
      ${LESSON_LOOKUP_PROJECTION}, "notesText": pt::text(notes)
    }`,
    params,
  )
  if (lessons.length === 0) return {candidates: [], lessonsBySlug: new Map()}

  const ranked = lessons
    .map((lesson) => ({lesson, score: scoreLesson(lesson, tokens)}))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
  if (ranked.length === 0) return {candidates: [], lessonsBySlug: new Map()}

  const lessonsBySlug = new Map(ranked.map((entry) => [entry.lesson.lessonSlug, entry.lesson]))

  const lessonsWithVideos = ranked.filter((entry) => entry.lesson.videoUrl).slice(0, 10)
  const videoUrls = [...new Set(lessonsWithVideos.map((entry) => entry.lesson.videoUrl))]
  const videos = videoUrls.length
    ? await serverClient.fetch<{url: string; chapter: {startSeconds: number; label: string} | null; chunk: {startSeconds: number; text: string} | null}[]>(
        /* groq */ `*[_type == "video" && url in $urls] {
          url,
          "chapter": chapters[${tokenConditions(tokens, ['label'])}][0] {startSeconds, label},
          "chunk": chunks[${tokenConditions(tokens, ['text'])}][0] {startSeconds, text}
        }`,
        {...params, urls: videoUrls},
      )
    : []
  const momentsByVideoUrl = new Map(videos.map((video) => [video.url, video]))

  const candidates: SearchCandidate[] = []
  const seenVideoUrls = new Set<string>()
  for (const {lesson} of ranked) {
    const moment = momentsByVideoUrl.get(lesson.videoUrl)
    const matched = moment?.chapter ?? moment?.chunk
    if (matched && !seenVideoUrls.has(lesson.videoUrl)) {
      seenVideoUrls.add(lesson.videoUrl)
      candidates.push({
        kind: 'video',
        lessonSlug: lesson.lessonSlug,
        matchedSeconds: matched.startSeconds,
        matchedLabel: 'label' in matched ? matched.label : matched.text.slice(0, 60),
      })
    }
    candidates.push({kind: 'lesson', lessonSlug: lesson.lessonSlug})
  }
  return {candidates, lessonsBySlug}
}

function shapeResults(candidates: SearchCandidate[], lessonsBySlug: Map<string, SearchLesson>) {
  const items: SearchApiResult[] = []
  for (const candidate of candidates) {
    const lesson = lessonsBySlug.get(candidate.lessonSlug)
    if (!lesson || lesson.courses.length === 0) continue
    const course = (candidate.courseSlug ? lesson.courses.find((entry) => entry.courseSlug === candidate.courseSlug) : undefined) ?? lesson.courses[0]
    const moduleIndex = course.modules.findIndex((courseModule) => courseModule.lessons.some((courseLesson) => courseLesson._id === lesson._id))
    const courseModule = moduleIndex >= 0 ? course.modules[moduleIndex] : null
    const lessonIndex = courseModule?.lessons.findIndex((courseLesson) => courseLesson._id === lesson._id) ?? -1
    if (!courseModule || lessonIndex < 0) continue

    const common = {
      lessonSlug: lesson.lessonSlug,
      lessonTitle: lesson.title,
      courseSlug: course.courseSlug,
      courseTitle: course.title,
      moduleTitle: courseModule.title,
      moduleIndex,
      lessonIndex,
      description: lesson.description || '',
    }

    if (candidate.kind === 'lesson') {
      items.push({...common, kind: 'lesson', keyPoints: lesson.keyPoints || [], href: `/lessons/${encodeURIComponent(lesson.lessonSlug)}`})
    } else if (candidate.matchedSeconds !== undefined && candidate.matchedLabel !== undefined && candidate.matchedSeconds <= lesson.duration) {
      items.push({
        ...common,
        kind: 'video',
        matchedSeconds: candidate.matchedSeconds,
        matchedLabel: candidate.matchedLabel,
        duration: lesson.duration,
        posterUrl: isSanityAssetUrl(lesson.posterUrl || null),
        href: `/lessons/${encodeURIComponent(lesson.lessonSlug)}?start=${Math.floor(candidate.matchedSeconds)}&source=search`,
      })
    }
  }
  return items
}

export async function POST(request: Request) {
  const startedAt = Date.now()
  const analytics = await getAnalyticsIdentity(request)
  const analyticsProperties: Record<string, string> = {}
  if (analytics.sessionId) analyticsProperties.$session_id = analytics.sessionId
  const captureFailure = (failureType: string, httpStatus: number) => captureServerEvent({
    distinctId: analytics.distinctId,
    event: 'search:request_fail',
    properties: {
      ...analyticsProperties,
      failure_type: failureType,
      http_status: httpStatus,
      is_authenticated: analytics.isAuthenticated,
      search_duration_ms: Date.now() - startedAt,
    },
  })
  const retryAfter = isRateLimited(request)
  if (retryAfter !== null) {
    await captureFailure('rate_limit', 429)
    return Response.json({error: 'Too many searches. Please try again later.'}, {status: 429, headers: {'Retry-After': String(retryAfter)}})
  }

  try {
    let requestBody: unknown
    try {
      requestBody = await request.json()
    } catch (error) {
      if (error instanceof SyntaxError) {
        await captureFailure('invalid_json', 400)
        return Response.json({error: 'Request body must be valid JSON.'}, {status: 400})
      }
      throw error
    }
    const input = searchRequestSchema.parse(requestBody)
    const missingConfig = ['OPENAI_API_KEY', 'SANITY_API_READ_TOKEN'].filter((key) => !process.env[key])
    if (missingConfig.length) {
      await captureFailure('configuration', 503)
      return Response.json({error: `Search is not configured. Missing: ${missingConfig.join(', ')}`}, {status: 503})
    }

    const context = await createSearchContext()
    const allTools = await context.client.tools()
    const groqQueryTool = allTools.groq_query
    if (!groqQueryTool) throw new Error('Sanity Context did not provide the groq_query tool')

    const systemPrompt = `${SEARCH_SYSTEM_PROMPT}\n\n${context.initialContext ? `Schema context:\n${context.initialContext}` : ''}`
    const deadline = Date.now() + SEARCH_TIMEOUT_MS

    let output: Awaited<ReturnType<typeof runAgentSearch>> | null = null
    let primaryFailure: {type: string; error: unknown} | null = null
    try {
      try {
        output = await runAgentSearch(input.query, systemPrompt, groqQueryTool, AbortSignal.timeout(Math.max(deadline - Date.now(), 1)))
      } catch (error) {
        if (!isNoOutputGeneratedError(error)) throw error
        const remaining = deadline - Date.now()
        if (remaining <= 1) throw error
        output = await runAgentSearch(input.query, systemPrompt, groqQueryTool, AbortSignal.timeout(remaining))
      }
    } catch (error) {
      primaryFailure = {type: isTimeoutError(error) ? 'timeout' : 'upstream', error}
      await disposeSearchContext()
    }

    let usedFallback = false
    let candidates: SearchCandidate[] = []
    let lessonsBySlug: Map<string, SearchLesson> = new Map()
    if (output) {
      candidates = []
      for (const item of output.results) {
        if (item.kind === 'lesson') {
          candidates.push({kind: 'lesson', lessonSlug: item.lessonSlug, courseSlug: item.courseSlug})
        } else if (item.matchedSeconds !== null && item.matchedLabel !== null) {
          candidates.push({kind: 'video', lessonSlug: item.lessonSlug, courseSlug: item.courseSlug, matchedSeconds: item.matchedSeconds, matchedLabel: item.matchedLabel})
        }
      }
      const lessons = await serverClient.fetch<SearchLesson[]>(SEARCH_RESULT_LOOKUP_QUERY, {lessonSlugs: output.results.map((item) => item.lessonSlug)})
      lessonsBySlug = new Map(lessons.map((lesson) => [lesson.lessonSlug, lesson]))
      if (shapeResults(candidates, lessonsBySlug).length === 0) {
        usedFallback = true
      }
    }
    if (!output || usedFallback) {
      if (primaryFailure) {
        console.error(`Search primary path failed (${primaryFailure.type}): ${primaryFailure.error instanceof Error ? `${primaryFailure.error.name}: ${primaryFailure.error.message}` : String(primaryFailure.error)}`)
      }
      try {
        const fallback = await runFallbackSearch(input.query)
        candidates = fallback.candidates
        lessonsBySlug = fallback.lessonsBySlug
      } catch (fallbackError) {
        if (!output) {
          console.error(`Search fallback failed: ${fallbackError instanceof Error ? `${fallbackError.name}: ${fallbackError.message}` : String(fallbackError)}`)
          const timedOut = primaryFailure?.type === 'timeout' || isTimeoutError(fallbackError)
          await captureFailure(timedOut ? 'timeout' : 'upstream', timedOut ? 504 : 502)
          return Response.json({error: 'Search is temporarily unavailable. Please try again.'}, {status: timedOut ? 504 : 502})
        }
        candidates = []
        lessonsBySlug = new Map()
      }
    }

    const results = shapeResults(candidates, lessonsBySlug)
    const courseCount = new Set(results.map((item) => item.courseSlug)).size

    void captureServerEvent({
      distinctId: analytics.distinctId,
      event: 'search:query_submit',
      properties: {
        ...analyticsProperties,
        query: input.query,
        result_count: results.length,
        course_count: courseCount,
        video_result_count: results.filter((item) => item.kind === 'video').length,
        lesson_result_count: results.filter((item) => item.kind === 'lesson').length,
        search_duration_ms: Date.now() - startedAt,
        is_authenticated: analytics.isAuthenticated,
        fallback_used: usedFallback,
        ...(primaryFailure ? {primary_failure_type: primaryFailure.type} : {}),
      },
    })
    return Response.json({query: input.query, total: results.length, courseCount, results})
  } catch (error) {
    if (error instanceof z.ZodError) {
      await captureFailure('validation', 400)
      return Response.json({error: 'Enter a search query between 2 and 200 characters.'}, {status: 400})
    }
    console.error(`Search request failed: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`)
    await disposeSearchContext()
    const timedOut = isTimeoutError(error)
    await captureFailure(timedOut ? 'timeout' : 'upstream', timedOut ? 504 : 502)
    return Response.json({error: 'Search is temporarily unavailable. Please try again.'}, {status: timedOut ? 504 : 502})
  }
}
