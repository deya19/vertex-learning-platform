import {openai} from '@ai-sdk/openai'
import {Output, generateText, stepCountIs} from 'ai'
import {z} from 'zod'

import {createSearchContext} from '../../../sanity/lib/search-context'

export const runtime = 'nodejs'

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
  let mcpClient: Awaited<ReturnType<typeof createSearchContext>>['client'] | null = null

  try {
    const input = searchRequestSchema.parse(await request.json())
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
    const results = output.results.reduce<SearchApiResult[]>((items, item) => {
      const common = {
        lessonSlug: item.lessonSlug,
        lessonTitle: item.lessonTitle,
        courseSlug: item.courseSlug,
        courseTitle: item.courseTitle,
        moduleTitle: item.moduleTitle,
        moduleIndex: item.moduleIndex,
        lessonIndex: item.lessonIndex,
        description: item.description,
      }

      if (item.kind === 'lesson') {
        items.push({...common, kind: 'lesson', keyPoints: item.keyPoints, href: `/lessons/${encodeURIComponent(item.lessonSlug)}`})
      } else if (item.matchedSeconds !== null && item.matchedLabel !== null && item.duration !== null) {
        items.push({...common, kind: 'video', matchedSeconds: item.matchedSeconds, matchedLabel: item.matchedLabel, duration: item.duration, posterUrl: isSanityAssetUrl(item.posterUrl), href: `/lessons/${encodeURIComponent(item.lessonSlug)}?start=${Math.floor(item.matchedSeconds)}`})
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
