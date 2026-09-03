import {auth} from '@clerk/nextjs/server'
import {openai} from '@ai-sdk/openai'
import {NoOutputGeneratedError, Output, generateText, stepCountIs} from 'ai'
import type {MCPClient} from '@ai-sdk/mcp'
import {Ratelimit} from '@upstash/ratelimit'
import {Redis} from '@upstash/redis'
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
const SEARCH_FETCH_TIMEOUT_MS = positiveEnvInt('SEARCH_FETCH_TIMEOUT_MS', 10000)
const SEARCH_MAX_CONCURRENT = positiveEnvInt('SEARCH_MAX_CONCURRENT', 8)
const SEARCH_MCP_MAX_RESPONSE_BYTES = positiveEnvInt('SEARCH_MCP_MAX_RESPONSE_BYTES', 100000)
const MAX_BODY_BYTES = 1024
const searchRateLimits = new Map<string, {count: number; resetAt: number}>()
let durableRatelimit: Ratelimit | null | undefined
let inFlightSearches = 0

class PayloadTooLargeError extends Error {}

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

// Whole-word hits only: the GROQ wildcard pre-filter matches substrings, so
// "*force*" would otherwise surface a chunk saying "reinforces".
function countTokenWordHits(text: string, tokens: string[]) {
  if (!text) return 0
  return tokens.reduce((count, token) => (new RegExp(`(?<![\\p{L}\\p{N}])${token}(?![\\p{L}\\p{N}])`, 'u').test(text.toLowerCase()) ? count + 1 : count), 0)
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

// Known limitation: header-less clients share one 'unknown' bucket, and the
// in-memory map only enforces the limit per server instance. Set
// UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to enforce the limit
// across instances.
function getDurableRatelimit() {
  if (durableRatelimit !== undefined) return durableRatelimit
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  durableRatelimit = url && token
    ? new Ratelimit({
        redis: new Redis({url, token}),
        limiter: Ratelimit.fixedWindow(SEARCH_RATE_LIMIT_MAX, `${Math.round(SEARCH_RATE_LIMIT_WINDOW_MS / 1000)} s`),
        prefix: 'vertex-search',
      })
    : null
  return durableRatelimit
}

function localRateLimit(key: string) {
  const now = Date.now()
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

async function isRateLimited(request: Request, userId: string | null) {
  const identity = userId ? `user:${userId}` : `ip:${getRequestKey(request)}`
  const durable = getDurableRatelimit()
  if (durable) {
    const {success, reset} = await durable.limit(identity)
    return success ? null : Math.max(1, Math.ceil((reset - Date.now()) / 1000))
  }
  return localRateLimit(identity)
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
    userId,
    distinctId: userId || boundedHeader(request, 'x-posthog-distinct-id') || `server-${crypto.randomUUID()}`,
    isAuthenticated: Boolean(userId),
    sessionId: boundedHeader(request, 'x-posthog-session-id'),
  }
}

async function readBoundedJsonBody(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get('content-length') || '')
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) throw new PayloadTooLargeError()
  if (!request.body) throw new PayloadTooLargeError()
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  while (true) {
    const {done, value} = await reader.read()
    if (done) break
    received += value.byteLength
    if (received > MAX_BODY_BYTES) {
      await reader.cancel()
      throw new PayloadTooLargeError()
    }
    chunks.push(value)
  }
  const body = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return JSON.parse(new TextDecoder().decode(body))
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
  results: z.array(searchResultSchema).max(50),
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

const SEARCH_SYSTEM_PROMPT = `You are Vertex's grounded course search agent. You search the Sanity dataset with the Context MCP groq_query tool and return only the requested structured output — never prose, never a chat reply.

## Behavior

Search both lesson topics and video moments for every query. Prefer one comprehensive GROQ query that gathers everything; use at most two queries, then immediately return the structured output. Keep every GROQ response small: project only fields the output schema requires, never query complete documents or unrestricted arrays, filter chapters and chunks inside GROQ before projecting, return at most five matching chapters or chunks per video, and never request notes bodies, full chapters arrays, or full transcript arrays.

## Boundaries

- Ground every title, slug, count, timestamp, duration, and description in query results. Never invent a course, lesson, price, duration, or timestamp.
- Never return a video document as a result by itself; a video moment is always tied to the lesson whose videoUrl matches that video's url.
- Do not use semanticSimilarity unless the Context endpoint explicitly supports it.

## Field mapping

For lesson results, set video-only fields to null and keyPoints to the stored lesson key points. For video results, set keyPoints to an empty array and populate every video field.

## When nothing matches

Return total 0, courseCount 0, and an empty results array. Do not pad with weak matches or speculate.

## Query and ranking rules

These are critical and are also in the Context instructions: use token-based matching — wildcard each meaningful keyword and OR the terms; never match a whole natural-language phrase as one pattern. Lesson notes are Portable Text, so match pt::text(notes). Match chapters before transcript chunks. Rank exact title/concept matches ahead of broad keyword hits and return every relevant result, not an arbitrary handful.`

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

// Enforces the "keep GROQ responses small" rule from the system prompt server
// side, so an injected instruction cannot pull large transcript payloads
// through the MCP tool.
function withResponseCap(tool: McpTool): McpTool {
  if (!tool.execute) return tool
  const execute = tool.execute.bind(tool)
  return {
    ...tool,
    execute: async (args, options) => {
      const output = await execute(args, options)
      if (JSON.stringify(output ?? null).length > SEARCH_MCP_MAX_RESPONSE_BYTES) {
        throw new Error('groq_query response exceeded the size limit')
      }
      return output
    },
  } as McpTool
}

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

async function runFallbackSearch(query: string, signal?: AbortSignal): Promise<{candidates: SearchCandidate[]; lessonsBySlug: Map<string, SearchLesson>}> {
  const tokens = tokenizeQuery(query)
  if (tokens.length === 0) return {candidates: [], lessonsBySlug: new Map()}

  const params = buildTokenParams(tokens)
  const lessons = await serverClient.fetch<SearchLesson[]>(
    /* groq */ `*[_type == "lesson" && (${tokenConditions(tokens, ['title', 'description', 'keyPoints', 'pt::text(notes)'])})] {
      ${LESSON_LOOKUP_PROJECTION}, "notesText": pt::text(notes)
    }`,
    params,
    {signal},
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
  const momentsByVideoUrl = await resolveVideoMoments(videoUrls, tokens, signal)

  const candidates: SearchCandidate[] = []
  const seenVideoUrls = new Set<string>()
  for (const {lesson} of ranked) {
    if (lesson.videoUrl && !seenVideoUrls.has(lesson.videoUrl)) {
      const matched = pickBestMoment(momentsByVideoUrl.get(lesson.videoUrl), tokens)
      if (matched) {
        seenVideoUrls.add(lesson.videoUrl)
        candidates.push({
          kind: 'video',
          lessonSlug: lesson.lessonSlug,
          matchedSeconds: matched.startSeconds,
          matchedLabel: matched.label,
        })
      }
    }
    candidates.push({kind: 'lesson', lessonSlug: lesson.lessonSlug})
  }
  return {candidates, lessonsBySlug}
}

type VideoMomentDoc = {url: string; chapters: {startSeconds: number; label: string}[]; chunks: {startSeconds: number; text: string}[]}

// Chapters are the clean table of contents, transcript chunks the noisier
// backstop; within each, the entry matching the most query tokens wins. An
// entry must match at least one whole query token to qualify.
function pickBestMoment(video: VideoMomentDoc | undefined, tokens: string[]): {startSeconds: number; label: string} | null {
  if (!video) return null
  const rank = <T extends {startSeconds: number}>(items: T[], text: (item: T) => string) =>
    items
      .map((item) => ({item, hits: countTokenWordHits(text(item), tokens)}))
      .filter((entry) => entry.hits > 0)
      .sort((a, b) => b.hits - a.hits || a.item.startSeconds - b.item.startSeconds)[0]?.item ?? null
  const chapter = rank(video.chapters, (chapter) => chapter.label)
  if (chapter) return {startSeconds: chapter.startSeconds, label: chapter.label}
  const chunk = rank(video.chunks, (chunk) => chunk.text)
  return chunk ? {startSeconds: chunk.startSeconds, label: chunk.text.slice(0, 60)} : null
}

// One bounded GROQ fetch for a set of video URLs: at most four filtered
// chapters and four filtered chunks per video, never a whole transcript.
async function resolveVideoMoments(videoUrls: string[], tokens: string[], signal?: AbortSignal): Promise<Map<string, VideoMomentDoc>> {
  if (videoUrls.length === 0 || tokens.length === 0) return new Map()
  const params = buildTokenParams(tokens)
  const videos = await serverClient.fetch<VideoMomentDoc[]>(
    /* groq */ `*[_type == "video" && url in $urls] {
      url,
      "chapters": chapters[${tokenConditions(tokens, ['label'])}][0...4] {startSeconds, label},
      "chunks": chunks[${tokenConditions(tokens, ['text'])}][0...4] {startSeconds, text}
    }`,
    {...params, urls: videoUrls},
    {signal},
  )
  return new Map(videos.map((video) => [video.url, video]))
}

// The agent path cannot be trusted with timestamps: it often returns lesson
// results only, and when it does return video moments they may be invented.
// Every video candidate is re-resolved against the video document (chapters
// first, transcript fallback); unresolvable ones downgrade to lesson results,
// and lesson candidates without a video moment get one added.
async function groundVideoCandidates(candidates: SearchCandidate[], lessonsBySlug: Map<string, SearchLesson>, query: string, signal?: AbortSignal): Promise<SearchCandidate[]> {
  const tokens = tokenizeQuery(query)
  if (candidates.length === 0 || tokens.length === 0) return candidates

  const lessonSlugsNeedingVideo = new Set(
    candidates.filter((candidate) => candidate.kind === 'lesson' && !candidates.some((other) => other.kind === 'video' && other.lessonSlug === candidate.lessonSlug)).map((candidate) => candidate.lessonSlug),
  )
  const videoUrls = [...new Set(candidates.map((candidate) => lessonsBySlug.get(candidate.lessonSlug)?.videoUrl).filter((url): url is string => Boolean(url)))].slice(0, 10)
  const momentsByVideoUrl = await resolveVideoMoments(videoUrls, tokens, signal)

  const grounded: SearchCandidate[] = []
  const seenVideoUrls = new Set<string>()
  const seenLessons = new Set<string>()
  const pushLesson = (candidate: SearchCandidate) => {
    if (seenLessons.has(candidate.lessonSlug)) return
    seenLessons.add(candidate.lessonSlug)
    grounded.push({kind: 'lesson', lessonSlug: candidate.lessonSlug, courseSlug: candidate.courseSlug})
  }
  const pushVideo = (lessonSlug: string, courseSlug: string | undefined, matched: {startSeconds: number; label: string}) => {
    const lesson = lessonsBySlug.get(lessonSlug)
    if (!lesson?.videoUrl || seenVideoUrls.has(lesson.videoUrl)) return
    seenVideoUrls.add(lesson.videoUrl)
    grounded.push({kind: 'video', lessonSlug, courseSlug, matchedSeconds: matched.startSeconds, matchedLabel: matched.label})
  }

  for (const candidate of candidates) {
    const lesson = lessonsBySlug.get(candidate.lessonSlug)
    const matched = lesson?.videoUrl ? pickBestMoment(momentsByVideoUrl.get(lesson.videoUrl), tokens) : null
    if (candidate.kind === 'video') {
      if (matched) pushVideo(candidate.lessonSlug, candidate.courseSlug, matched)
      else pushLesson(candidate)
    } else {
      if (lessonSlugsNeedingVideo.has(candidate.lessonSlug) && matched) pushVideo(candidate.lessonSlug, candidate.courseSlug, matched)
      pushLesson(candidate)
    }
  }
  return grounded
}

// For queries whose only footprint is a chapter label or the transcript, no
// lesson-field match exists. Search the video documents directly and tie each
// matched video back to the lesson that plays it.
async function findVideoMomentResults(query: string, signal?: AbortSignal): Promise<{candidates: SearchCandidate[]; lessonsBySlug: Map<string, SearchLesson>}> {
  const tokens = tokenizeQuery(query)
  if (tokens.length === 0) return {candidates: [], lessonsBySlug: new Map()}

  const params = buildTokenParams(tokens)
  const matchedVideos = await serverClient.fetch<{url: string}[]>(
    /* groq */ `*[_type == "video" && (count(chapters[${tokenConditions(tokens, ['label'])}]) > 0 || count(chunks[${tokenConditions(tokens, ['text'])}]) > 0)][0...9] {url}`,
    params,
    {signal},
  )
  if (matchedVideos.length === 0) return {candidates: [], lessonsBySlug: new Map()}

  const momentsByVideoUrl = await resolveVideoMoments(matchedVideos.map((video) => video.url), tokens, signal)
  if (momentsByVideoUrl.size === 0) return {candidates: [], lessonsBySlug: new Map()}

  const urls = [...momentsByVideoUrl.keys()]
  const lessons = await serverClient.fetch<SearchLesson[]>(
    /* groq */ `*[_type == "lesson" && videoUrl in $urls] {
      ${LESSON_LOOKUP_PROJECTION}
    }`,
    {urls},
    {signal},
  )
  const lessonsBySlug = new Map(lessons.map((lesson) => [lesson.lessonSlug, lesson]))
  const candidates: SearchCandidate[] = []
  const seenVideoUrls = new Set<string>()
  for (const lesson of lessons) {
    if (seenVideoUrls.has(lesson.videoUrl)) continue
    const matched = pickBestMoment(momentsByVideoUrl.get(lesson.videoUrl), tokens)
    if (!matched) continue
    seenVideoUrls.add(lesson.videoUrl)
    candidates.push({kind: 'video', lessonSlug: lesson.lessonSlug, matchedSeconds: matched.startSeconds, matchedLabel: matched.label})
    candidates.push({kind: 'lesson', lessonSlug: lesson.lessonSlug})
  }
  return {candidates, lessonsBySlug}
}

function mergeSearchCandidates(candidates: SearchCandidate[], lessonsBySlug: Map<string, SearchLesson>, extra: {candidates: SearchCandidate[]; lessonsBySlug: Map<string, SearchLesson>}) {
  const seen = new Set(candidates.map((candidate) => `${candidate.kind}:${candidate.lessonSlug}`))
  for (const candidate of extra.candidates) {
    const key = `${candidate.kind}:${candidate.lessonSlug}`
    if (!seen.has(key)) {
      candidates.push(candidate)
      seen.add(key)
    }
  }
  for (const [slug, lesson] of extra.lessonsBySlug) if (!lessonsBySlug.has(slug)) lessonsBySlug.set(slug, lesson)
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
    } else if (candidate.matchedSeconds !== undefined && candidate.matchedLabel !== undefined && (lesson.duration <= 0 || candidate.matchedSeconds <= lesson.duration)) {
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
  const captureFailure = (failureType: string, httpStatus: number) => {
    void captureServerEvent({
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
  }
  const retryAfter = await isRateLimited(request, analytics.userId)
  if (retryAfter !== null) {
    captureFailure('rate_limit', 429)
    return Response.json({error: 'Too many searches. Please try again later.'}, {status: 429, headers: {'Retry-After': String(retryAfter)}})
  }
  if (inFlightSearches >= SEARCH_MAX_CONCURRENT) {
    captureFailure('concurrency', 429)
    return Response.json({error: 'Too many searches. Please try again later.'}, {status: 429, headers: {'Retry-After': '5'}})
  }
  inFlightSearches += 1

  try {
    let requestBody: unknown
    try {
      requestBody = await readBoundedJsonBody(request)
    } catch (error) {
      if (error instanceof PayloadTooLargeError) {
        captureFailure('body_too_large', 413)
        return Response.json({error: 'Request body is too large.'}, {status: 413})
      }
      if (error instanceof SyntaxError) {
        captureFailure('invalid_json', 400)
        return Response.json({error: 'Request body must be valid JSON.'}, {status: 400})
      }
      throw error
    }
    const input = searchRequestSchema.parse(requestBody)
    const missingConfig = ['OPENAI_API_KEY', 'SANITY_API_READ_TOKEN'].filter((key) => !process.env[key])
    if (missingConfig.length) {
      console.error(`Search is not configured. Missing: ${missingConfig.join(', ')}`)
      captureFailure('configuration', 503)
      return Response.json({error: 'Search is not configured.'}, {status: 503})
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
        output = await runAgentSearch(input.query, systemPrompt, withResponseCap(groqQueryTool), AbortSignal.timeout(Math.max(deadline - Date.now(), 1)))
      } catch (error) {
        if (!isNoOutputGeneratedError(error)) throw error
        const remaining = deadline - Date.now()
        if (remaining <= 1) throw error
        output = await runAgentSearch(input.query, systemPrompt, withResponseCap(groqQueryTool), AbortSignal.timeout(remaining))
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
      const lessonSlugs = [...new Set(output.results.map((item) => item.lessonSlug))].slice(0, 50)
      const lessons = await serverClient.fetch<SearchLesson[]>(
        SEARCH_RESULT_LOOKUP_QUERY,
        {lessonSlugs: lessonSlugs},
        {signal: AbortSignal.timeout(SEARCH_FETCH_TIMEOUT_MS)},
      )
      lessonsBySlug = new Map(lessons.map((lesson) => [lesson.lessonSlug, lesson]))
      try {
        candidates = await groundVideoCandidates(candidates, lessonsBySlug, input.query, AbortSignal.timeout(SEARCH_FETCH_TIMEOUT_MS))
      } catch (groundError) {
        console.error(`Search video grounding failed: ${groundError instanceof Error ? `${groundError.name}: ${groundError.message}` : String(groundError)}`)
      }
      if (!candidates.some((candidate) => candidate.kind === 'video')) {
        try {
          mergeSearchCandidates(candidates, lessonsBySlug, await findVideoMomentResults(input.query, AbortSignal.timeout(SEARCH_FETCH_TIMEOUT_MS)))
        } catch (mergeError) {
          console.error(`Search video moment lookup failed: ${mergeError instanceof Error ? `${mergeError.name}: ${mergeError.message}` : String(mergeError)}`)
        }
      }
      if (!candidates.some((candidate) => candidate.kind === 'video')) {
        // Still no video moment; merge the deterministic keyword results so
        // grounded timestamps and lesson matches surface (AGENTS.md: search
        // both ways and merge).
        try {
          mergeSearchCandidates(candidates, lessonsBySlug, await runFallbackSearch(input.query, AbortSignal.timeout(SEARCH_FETCH_TIMEOUT_MS)))
        } catch (mergeError) {
          console.error(`Search video merge failed: ${mergeError instanceof Error ? `${mergeError.name}: ${mergeError.message}` : String(mergeError)}`)
        }
      }
      if (shapeResults(candidates, lessonsBySlug).length === 0) {
        usedFallback = true
      }
    }
    if (!output || usedFallback) {
      if (primaryFailure) {
        console.error(`Search primary path failed (${primaryFailure.type}): ${primaryFailure.error instanceof Error ? `${primaryFailure.error.name}: ${primaryFailure.error.message}` : String(primaryFailure.error)}`)
      }
      try {
        const fallback = await runFallbackSearch(input.query, AbortSignal.timeout(SEARCH_FETCH_TIMEOUT_MS))
        candidates = fallback.candidates
        lessonsBySlug = fallback.lessonsBySlug
      } catch (fallbackError) {
        if (!output) {
          console.error(`Search fallback failed: ${fallbackError instanceof Error ? `${fallbackError.name}: ${fallbackError.message}` : String(fallbackError)}`)
          const timedOut = primaryFailure?.type === 'timeout' || isTimeoutError(fallbackError)
          captureFailure(timedOut ? 'timeout' : 'upstream', timedOut ? 504 : 502)
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
      captureFailure('validation', 400)
      return Response.json({error: 'Enter a search query between 2 and 200 characters.'}, {status: 400})
    }
    console.error(`Search request failed: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`)
    await disposeSearchContext()
    const timedOut = isTimeoutError(error)
    captureFailure(timedOut ? 'timeout' : 'upstream', timedOut ? 504 : 502)
    return Response.json({error: 'Search is temporarily unavailable. Please try again.'}, {status: timedOut ? 504 : 502})
  } finally {
    inFlightSearches -= 1
  }
}
