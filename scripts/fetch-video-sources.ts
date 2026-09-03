import {spawn} from 'node:child_process'
import {copyFile, mkdir, readFile, readdir, stat, unlink, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'

type ManifestEntry = {id?: string; url?: string; videoUrl?: string}
type Result = {key: string; status: 'acquired' | 'existing' | 'failed'; chapters?: number; error?: string}
type Options = {manifest: string; sources: string; report: string; refresh: boolean; limit?: number}

function optionsFromArgs(args: string[]): Options {
  const options: Options = {manifest: 'scripts/videos.json', sources: 'scripts/video-sources', report: 'scripts/video-acquisition-report.json', refresh: false}
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--refresh') options.refresh = true
    else if (['--manifest', '--sources', '--report', '--limit'].includes(arg)) {
      const value = args[index + 1]
      if (!value) throw new Error(`${arg} requires a value`)
      if (arg === '--limit') options.limit = Number(value)
      else options[arg.slice(2) as 'manifest' | 'sources' | 'report'] = value
      index += 1
    } else throw new Error(`Unknown argument: ${arg}`)
  }
  if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 1)) throw new Error('--limit must be a positive integer')
  return options
}

function run(command: string, args: string[]) {
  return new Promise<{code: number; output: string}>((done) => {
    const child = spawn(command, args, {stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true})
    let output = ''
    child.stdout.on('data', (chunk) => { output += String(chunk) })
    child.stderr.on('data', (chunk) => { output += String(chunk) })
    child.on('error', (error) => done({code: 1, output: error.message}))
    child.on('close', (code) => done({code: code ?? 1, output}))
  })
}

async function exists(path: string) {
  try { return (await stat(path)).size > 0 } catch { return false }
}

function videoUrl(entry: ManifestEntry) {
  const value = entry.url || entry.videoUrl || (entry.id ? `https://www.youtube.com/watch?v=${entry.id}` : '')
  if (!value) throw new Error('Manifest entry has no video URL or ID')
  return value
}

function errorSummary(output: string) {
  const lines = output.replace(/\r/g, '').split('\n').map((line) => line.trim()).filter(Boolean)
  return lines.findLast((line) => line.startsWith('ERROR:'))?.replace(/^ERROR:\s*/, '') || lines.at(-1) || 'yt-dlp failed without an error message'
}

async function writeReport(path: string, results: Result[], total: number) {
  const report = {
    total,
    attempted: results.length,
    acquired: results.filter((result) => result.status === 'acquired').length,
    existing: results.filter((result) => result.status === 'existing').length,
    failed: results.filter((result) => result.status === 'failed').length,
    withChapters: results.filter((result) => (result.chapters ?? 0) > 0).length,
    results,
  }
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`)
}

async function main() {
  const options = optionsFromArgs(process.argv.slice(2))
  const manifest = JSON.parse(await readFile(resolve(options.manifest), 'utf8')) as Record<string, ManifestEntry>
  const entries = Object.entries(manifest).slice(0, options.limit)
  const sources = resolve(options.sources)
  const reportPath = resolve(options.report)
  await mkdir(sources, {recursive: true})
  const results: Result[] = []

  for (const [index, [key, entry]] of entries.entries()) {
    const captionPath = resolve(sources, `${key}.vtt`)
    const chapterPath = resolve(sources, `${key}.chapters.json`)
    if (!options.refresh && await exists(captionPath) && await exists(chapterPath)) {
      const chapters = JSON.parse(await readFile(chapterPath, 'utf8')) as unknown[]
      results.push({key, status: 'existing', chapters: chapters.length})
      console.log(`[${index + 1}/${entries.length}] ${key}: existing`)
      await writeReport(reportPath, results, entries.length)
      continue
    }

    const temporaryPrefix = `.acquire-${key}`
    const outputTemplate = resolve(sources, `${temporaryPrefix}.%(ext)s`)
    const acquisition = await run('python', ['-m', 'yt_dlp', '--skip-download', '--no-playlist', '--write-subs', '--write-auto-subs', '--sub-langs', 'en', '--sub-format', 'vtt', '--write-info-json', '--output', outputTemplate, videoUrl(entry)])
    const files = await readdir(sources)
    const caption = files.find((file) => file.startsWith(`${temporaryPrefix}.`) && file.endsWith('.vtt'))
    const info = files.find((file) => file === `${temporaryPrefix}.info.json`)

    try {
      if (!caption || !info) throw new Error(errorSummary(acquisition.output))
      const metadata = JSON.parse(await readFile(resolve(sources, info), 'utf8')) as {chapters?: Array<{start_time?: number; title?: string}>}
      const chapters = (metadata.chapters || []).flatMap((chapter) => Number.isFinite(chapter.start_time) && chapter.start_time! >= 0 && chapter.title?.trim() ? [{startSeconds: Math.floor(chapter.start_time!), label: chapter.title.trim()}] : [])
      await copyFile(resolve(sources, caption), captionPath)
      await writeFile(chapterPath, `${JSON.stringify(chapters, null, 2)}\n`)
      results.push({key, status: 'acquired', chapters: chapters.length})
      console.log(`[${index + 1}/${entries.length}] ${key}: acquired (${chapters.length} chapters)`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      results.push({key, status: 'failed', error: message})
      console.error(`[${index + 1}/${entries.length}] ${key}: ${message}`)
    } finally {
      for (const file of files.filter((file) => file.startsWith(`${temporaryPrefix}.`))) await unlink(resolve(sources, file)).catch(() => undefined)
      await writeReport(reportPath, results, entries.length)
    }
  }

  const failed = results.filter((result) => result.status === 'failed').length
  console.log(`Attempted ${results.length}; acquired ${results.filter((result) => result.status === 'acquired').length}; existing ${results.filter((result) => result.status === 'existing').length}; failed ${failed}`)
  if (failed) process.exitCode = 1
}

void main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
