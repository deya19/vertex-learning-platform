import {createHash} from 'node:crypto'
import {readFile, writeFile} from 'node:fs/promises'
import {dirname, extname, resolve} from 'node:path'
import {createClient} from '@sanity/client'

type Cue = {startSeconds: number; endSeconds?: number; text: string}
type Chapter = {startSeconds: number; label: string}
type ManifestEntry = {id?: string; url?: string; videoUrl?: string; duration?: number; transcript?: string | Cue[]; chapters?: string | Chapter[]}
type VideoDocument = {_id: string; _type: 'video'; url: string; chapters: Array<Chapter & {_key: string}>; chunks: Array<{_key: string; startSeconds: number; text: string}>}

type Options = {manifest: string; sources: string; output: string; report: string; write: boolean; allowPartial: boolean}
const MAX_CHUNK_LENGTH = 420
const MAX_CHUNK_GAP = 20

function usage() {
  console.log('Usage: npm run ingest:videos -- [--manifest path] [--sources dir] [--output path] [--report path] [--write] [--allow-partial]')
  console.log('Sidecars: <manifest-key>.vtt, .srt, or .json; chapters use <manifest-key>.chapters.json.')
}

function optionsFromArgs(args: string[]): Options {
  const options: Options = {manifest: 'scripts/videos.json', sources: 'scripts/video-sources', output: 'scripts/video-documents.ndjson', report: 'scripts/video-ingestion-report.json', write: false, allowPartial: false}
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--write') options.write = true
    else if (arg === '--allow-partial') options.allowPartial = true
    else if (arg === '--help') { usage(); process.exit(0) }
    else if (['--manifest', '--sources', '--output', '--report'].includes(arg)) {
      const value = args[index + 1]
      if (!value) throw new Error(`${arg} requires a value`)
      options[arg.slice(2) as 'manifest' | 'sources' | 'output' | 'report'] = value
      index += 1
    } else throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

function parseTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value
  if (typeof value !== 'string') throw new Error(`Invalid timestamp: ${String(value)}`)
  const match = value.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/)
  if (!match) throw new Error(`Invalid timestamp: ${value}`)
  const milliseconds = Number((match[4] || '').padEnd(3, '0') || 0)
  const seconds = Number(match[3]) + milliseconds / 1000 + Number(match[2]) * 60 + Number(match[1] || 0) * 3600
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error(`Invalid timestamp: ${value}`)
  return seconds
}

function cleanText(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Caption text must be a string')
  return value.replace(/<[^>]*>/g, ' ').replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => ({'&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'"}[entity] || entity)).replace(/\s+/g, ' ').trim()
}

function parseCueArray(value: unknown): Cue[] {
  if (!Array.isArray(value)) throw new Error('Caption JSON must be an array')
  return value.map((item, index) => {
    if (!item || typeof item !== 'object') throw new Error(`Caption ${index + 1} is not an object`)
    const cue = item as Record<string, unknown>
    const startSeconds = parseTimestamp(cue.startSeconds ?? cue.start)
    const endValue = cue.endSeconds ?? cue.end
    const text = cleanText(cue.text)
    if (!text) throw new Error(`Caption ${index + 1} has empty text`)
    return {...(endValue === undefined ? {} : {endSeconds: parseTimestamp(endValue)}), startSeconds, text}
  })
}

function parseVttOrSrt(source: string, extension: string): Cue[] {
  const blocks = source.replace(/^\uFEFF/, '').replace(/\r/g, '').split(/\n{2,}/)
  const cues: Cue[] = []
  for (const block of blocks) {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean)
    const timeIndex = lines.findIndex((line) => line.includes('-->'))
    if (timeIndex < 0) continue
    const [start, end] = lines[timeIndex].split('-->').map((part) => part.trim().split(/\s+/)[0])
    const text = cleanText(lines.slice(timeIndex + 1).join(' '))
    if (!text) continue
    cues.push({startSeconds: parseTimestamp(start), endSeconds: parseTimestamp(end), text})
  }
  if (!cues.length) throw new Error(`No cues found in ${extension.toUpperCase()} source`)
  return cues
}

function parseCaptions(source: string, extension: string): Cue[] {
  if (extension === '.vtt' || extension === '.srt') return parseVttOrSrt(source, extension)
  const parsed = JSON.parse(source) as unknown
  if (Array.isArray(parsed)) return parseCueArray(parsed)
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as {cues?: unknown}).cues)) return parseCueArray((parsed as {cues: unknown[]}).cues)
  throw new Error('Caption JSON must contain an array or a cues array')
}

function parseChapters(source: string): Chapter[] {
  const parsed = JSON.parse(source) as unknown
  const values = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' && Array.isArray((parsed as {chapters?: unknown}).chapters) ? (parsed as {chapters: unknown[]}).chapters : null
  if (!values) throw new Error('Chapter JSON must contain an array or a chapters array')
  return values.flatMap((item, index) => {
    if (!item || typeof item !== 'object') throw new Error(`Chapter ${index + 1} is not an object`)
    const chapter = item as Record<string, unknown>
    const label = cleanText(chapter.label ?? chapter.title)
    if (!label) return []
    return [{startSeconds: parseTimestamp(chapter.startSeconds ?? chapter.start), label}]
  })
}

function providerFor(url: string): 'youtube' | 'vimeo' | 'bunny' {
  const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  if (hostname === 'youtube.com' || hostname === 'youtu.be' || hostname.endsWith('.youtube.com')) return 'youtube'
  if (hostname === 'vimeo.com' || hostname === 'player.vimeo.com' || hostname.endsWith('.vimeo.com')) return 'vimeo'
  if (hostname === 'bunny.net' || hostname.endsWith('.bunny.net') || hostname.endsWith('.bunnycdn.com') || hostname === 'mediadelivery.net' || hostname.endsWith('.mediadelivery.net')) return 'bunny'
  throw new Error(`Unsupported video provider: ${hostname}`)
}

function canonicalUrl(value: string): string {
  const url = new URL(value)
  url.hash = ''
  return url.toString()
}

function documentId(url: string): string {
  const safe = url.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 96)
  return `video-${safe}-${createHash('sha256').update(url).digest('hex').slice(0, 10)}`
}

function normalizeChapters(chapters: Chapter[]): Chapter[] {
  const seen = new Set<string>()
  return chapters.filter((chapter) => chapter.startSeconds >= 0).sort((a, b) => a.startSeconds - b.startSeconds).filter((chapter) => {
    const key = `${chapter.startSeconds}:${chapter.label.toLowerCase()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function normalizeCues(cues: Cue[], chapters: Chapter[]): Cue[] {
  const seen = new Set<string>()
  const sorted = cues.filter((cue) => cue.startSeconds >= 0 && cue.text).sort((a, b) => a.startSeconds - b.startSeconds)
  return sorted.filter((cue) => {
    const key = `${cue.startSeconds}:${cue.text}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).reduce<Cue[]>((chunks, cue) => {
    const previous = chunks.at(-1)
    const crossesChapter = previous && chapters.some((chapter) => chapter.startSeconds > previous.startSeconds && chapter.startSeconds <= cue.startSeconds)
    if (previous && !crossesChapter && cue.startSeconds - previous.startSeconds <= MAX_CHUNK_GAP && `${previous.text} ${cue.text}`.length <= MAX_CHUNK_LENGTH) previous.text = `${previous.text} ${cue.text}`
    else chunks.push({...cue})
    return chunks
  }, [])
}

function stableKey(prefix: string, seconds: number, index: number) {
  return `${prefix}-${seconds.toFixed(3).replace('.', '-')}-${index}`
}

async function sidecar(base: string, key: string, extensions: string[]): Promise<{source: string; extension: string} | null> {
  for (const extension of extensions) {
    try { return {source: await readFile(resolve(base, `${key}${extension}`), 'utf8'), extension} } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  return null
}

async function main() {
  const options = optionsFromArgs(process.argv.slice(2))
  const manifestPath = resolve(options.manifest)
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, ManifestEntry>
  const documents: VideoDocument[] = []
  const errors: Array<{key: string; error: string}> = []
  const warnings: Array<{key: string; warning: string}> = []

  for (const [key, entry] of Object.entries(manifest)) {
    try {
      const url = canonicalUrl(entry.url || entry.videoUrl || `https://www.youtube.com/watch?v=${entry.id || ''}`)
      providerFor(url)
      const captionSource = typeof entry.transcript === 'string' ? {source: await readFile(resolve(dirname(manifestPath), entry.transcript), 'utf8'), extension: extname(entry.transcript)} : Array.isArray(entry.transcript) ? null : await sidecar(options.sources, key, ['.vtt', '.srt', '.json'])
      const chapterSource = typeof entry.chapters === 'string' ? await readFile(resolve(dirname(manifestPath), entry.chapters), 'utf8') : Array.isArray(entry.chapters) ? null : (await sidecar(options.sources, `${key}.chapters`, ['.json']))?.source
      if (!captionSource && !Array.isArray(entry.transcript)) throw new Error('Missing transcript sidecar or inline transcript')
      if (!chapterSource && !Array.isArray(entry.chapters)) throw new Error('Missing chapter sidecar or inline chapters')
      const chapters = normalizeChapters(Array.isArray(entry.chapters) ? entry.chapters : parseChapters(chapterSource!))
      const cues = Array.isArray(entry.transcript) ? parseCueArray(entry.transcript) : parseCaptions(captionSource!.source, captionSource!.extension)
      const chunks = normalizeCues(cues, chapters)
      if (entry.duration !== undefined && chapters.some((chapter) => chapter.startSeconds > entry.duration!)) warnings.push({key, warning: 'A chapter starts after the manifest duration'})
      documents.push({_id: documentId(url), _type: 'video', url, chapters: chapters.map((chapter, index) => ({...chapter, _key: stableKey('chapter', chapter.startSeconds, index)})), chunks: chunks.map((chunk, index) => ({_key: stableKey('chunk', chunk.startSeconds, index), startSeconds: chunk.startSeconds, text: chunk.text}))})
    } catch (error) { errors.push({key, error: error instanceof Error ? error.message : String(error)}) }
  }

  if (options.write && errors.length && !options.allowPartial) throw new Error(`Refusing to write with ${errors.length} invalid manifest entries; pass --allow-partial to write only valid documents`)
  await writeFile(resolve(options.output), documents.map((document) => JSON.stringify(document)).join('\n') + (documents.length ? '\n' : ''))
  const report = {processed: Object.keys(manifest).length, emitted: documents.length, skipped: errors.length, warnings, errors}
  await writeFile(resolve(options.report), JSON.stringify(report, null, 2) + '\n')

  if (options.write) {
    const token = process.env.SANITY_API_WRITE_TOKEN
    const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID
    const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET
    if (!token || !projectId || !dataset) throw new Error('SANITY_API_WRITE_TOKEN, NEXT_PUBLIC_SANITY_PROJECT_ID, and NEXT_PUBLIC_SANITY_DATASET are required for --write')
    const client = createClient({projectId, dataset, apiVersion: process.env.NEXT_PUBLIC_SANITY_API_VERSION || '2026-08-25', token, useCdn: false})
    for (const document of documents) await client.createOrReplace(document)
  }

  console.log(`Processed ${report.processed}; emitted ${report.emitted}; skipped ${report.skipped}; warnings ${report.warnings.length}`)
  if (errors.length) { for (const error of errors) console.error(`${error.key}: ${error.error}`); process.exitCode = 1 }
}

void main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
