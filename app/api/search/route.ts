import {openai} from '@ai-sdk/openai'
import {Output, generateText, stepCountIs} from 'ai'
import {z} from 'zod'

import {serverClient} from '../../../sanity/lib/client'
import {createSearchContext} from '../../../sanity/lib/search-context'

export const runtime = 'nodejs'

function positiveEnvInt(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] || '', 10)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

const SEARCH_RATE_LIMIT_MAX = positiveEnvInt('SEARCH_RATE_LIMIT_MAX', 20)
const SEARCH_RATE_LIMIT_WINDOW_MS = positiveEnvInt('SEARCH_RATE_LIMIT_WINDOW_MS', 60000)
const searchRateLimits = new Map<string, {count: number; resetAt: number}>()

const SEARCH_RESULT_LOOKUP_QUERY = /* groq */ `
  *[_type == "lesson" && slug.current in $lessonSlugs] {
    _id, title, "lessonSlug": slug.current, description,
    duration, keyPoints, videoUrl,
    "posterUrl": coalesce(poster, thumbnail).asset->url,
    "courses": *[_type == "course" && references(^._id)] {
      _id, title, "courseSlug": slug.current,
      modules[]{title, lessons[]->{_id}}
    }
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
  courses: { _id: string; title: string; courseSlug: string; modules: {title: string; lessons: {_id: string}[]}[] }[]
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

Keep every GROQ response small. Never query complete documents or unrestricted arrays. Project only fields required by the output schema. Filter chapters and chunks inside GROQ before projecting them and return at most five matching chapters or chunks per video. Do not request notes bodies, full chapters arrays, or full transcript arrays in query results.

Use token-based matching: wildcard each meaningful keyword and OR the terms; never match a whole natural-language phrase as one pattern. Rank exact title/concept matches ahead of broad matches. Return every relevant result, not an arbitrary handful. Ground every title, slug, count, timestamp, duration, and description in query results. For lesson results, set video-only fields to null and keyPoints to the stored lesson key points. For video results, set keyPoints to an empty array and populate every video field. If there are no matches, return total 0, courseCount 0, and an empty results array. Do not invent data. Do not use semanticSimilarity unless the Context endpoint explicitly supports it.`

function isSanityAssetUrl(value: string | null) {
  return value?.startsWith('https://cdn.sanity.io/') ? value : undefined
}

export async function POST(request: Request) {
  const retryAfter = isRateLimited(request)
  if (retryAfter !== null) return Response.json({error: 'Too many searches. Please try again later.'}, {status: 429, headers: {'Retry-After': String(retryAfter)}})

  let mcpClient: Awaited<ReturnType<typeof createSearchContext>>['client'] | null = null

  try {
    let requestBody: unknown
    try {
      requestBody = await request.json()
    } catch (error) {
      if (error instanceof SyntaxError) return Response.json({error: 'Request body must be valid JSON.'}, {status: 400})
      throw error
    }
    const input = searchRequestSchema.parse(requestBody)
    const missingConfig = ['OPENAI_API_KEY', 'SANITY_API_READ_TOKEN'].filter((key) => !process.env[key])
    if (missingConfig.length) {
      return Response.json({error: `Search is not configured. Missing: ${missingConfig.join(', ')}`}, {status: 503})
    }

    const context = await createSearchContext()
    mcpClient = context.client
    const allTools = await mcpClient.tools()
    const groqQueryTool = allTools.groq_query
    if (!groqQueryTool) throw new Error('Sanity Context did not provide the groq_query tool')

    const result = await generateText({
      model: openai(process.env.OPENAI_MODEL || 'gpt-4o-mini'),
      system: `${SEARCH_SYSTEM_PROMPT}\n\n${context.initialContext ? `Schema context:\n${context.initialContext}` : ''}`,
      prompt: `Find all relevant course and lesson results for this learner query: ${input.query}`,
      tools: {groq_query: groqQueryTool},
      stopWhen: stepCountIs(8),
      output: Output.object({schema: searchResponseSchema}),
    })

    const output = result.output ?? {total: 0, courseCount: 0, results: []}
    const lessons = await serverClient.fetch<SearchLesson[]>(SEARCH_RESULT_LOOKUP_QUERY, {lessonSlugs: output.results.map((item) => item.lessonSlug)})
    const lessonsBySlug = new Map(lessons.map((lesson) => [lesson.lessonSlug, lesson]))
    const results = output.results.reduce<SearchApiResult[]>((items, item) => {
      const lesson = lessonsBySlug.get(item.lessonSlug)
      const course = lesson?.courses.find((candidate) => candidate.courseSlug === item.courseSlug)
      if (!lesson || !course) return items
      const moduleIndex = course.modules.findIndex((candidate) => candidate.lessons.some((courseLesson) => courseLesson._id === lesson._id))
      const courseModule = moduleIndex >= 0 ? course.modules[moduleIndex] : null
      const lessonIndex = courseModule?.lessons.findIndex((courseLesson) => courseLesson._id === lesson._id) ?? -1
      if (!courseModule || lessonIndex < 0) return items

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

      if (item.kind === 'lesson') {
        items.push({...common, kind: 'lesson', keyPoints: lesson.keyPoints || [], href: `/lessons/${encodeURIComponent(lesson.lessonSlug)}`})
      } else if (item.matchedSeconds !== null && item.matchedLabel !== null && item.matchedSeconds <= lesson.duration) {
        items.push({...common, kind: 'video', matchedSeconds: item.matchedSeconds, matchedLabel: item.matchedLabel, duration: lesson.duration, posterUrl: isSanityAssetUrl(lesson.posterUrl || null), href: `/lessons/${encodeURIComponent(lesson.lessonSlug)}?start=${Math.floor(item.matchedSeconds)}`})
      }

      return items
    }, [])
    const courseCount = new Set(results.map((item) => item.courseSlug)).size

    return Response.json({query: input.query, total: results.length, courseCount, results})
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({error: 'Enter a search query between 2 and 200 characters.'}, {status: 400})
    console.error(`Search request failed: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`)
    return Response.json({error: 'Search is temporarily unavailable. Please try again.'}, {status: 502})
  } finally {
    await mcpClient?.close()
  }
}
