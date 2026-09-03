'use client'

import {SignInButton, SignUpButton, UserButton, useAuth} from '@clerk/nextjs'
import Image from 'next/image'
import Link from 'next/link'
import {FormEvent, useEffect, useMemo, useRef, useState} from 'react'

import posthog from 'posthog-js'

type VideoResult = {
  kind: 'video'
  lessonSlug: string
  lessonTitle: string
  courseSlug: string
  courseTitle: string
  moduleTitle: string
  moduleIndex: number
  lessonIndex: number
  description: string
  matchedSeconds: number
  matchedLabel: string
  duration: number
  posterUrl?: string
  href: string
}

type LessonResult = {
  kind: 'lesson'
  lessonSlug: string
  lessonTitle: string
  courseSlug: string
  courseTitle: string
  moduleTitle: string
  moduleIndex: number
  lessonIndex: number
  keyPoints: string[]
  description: string
  href: string
}

type SearchResponse = {query: string; total: number; courseCount: number; results: (VideoResult | LessonResult)[]}
type IconName = 'arrow' | 'bell' | 'check' | 'document' | 'folder' | 'play' | 'search'

function Icon({name}: {name: IconName}) {
  const content = {
    arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
    bell: <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" />,
    check: <path d="m5 12 4 4L19 6" />,
    document: <path d="M6 4h10l3 3v13H6V4Zm10 0v4h3M9 12h6m-6 3h6" />,
    folder: <path d="M3 7h7l2 2h9v10H3V7Zm0 0V5h6l2 2" />,
    play: <path d="m9 6 9 6-9 6V6Z" />,
    search: <><circle cx="10.8" cy="10.8" r="7.2" /><path d="m16.2 16.2 5 5" /></>,
  }[name]
  return <svg viewBox="0 0 24 24" aria-hidden="true">{content}</svg>
}

function formatTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  return `${Math.floor(safeSeconds / 60)}:${(safeSeconds % 60).toString().padStart(2, '0')}`
}

function getAnalyticsHeaders() {
  const distinctId = posthog.get_distinct_id()
  const sessionId = posthog.get_session_id()
  return {
    ...(distinctId ? {'x-posthog-distinct-id': distinctId} : {}),
    ...(sessionId ? {'x-posthog-session-id': sessionId} : {}),
  }
}

function CourseMark({title}: {title: string}) {
  const normalized = title.toLowerCase()
  const mark = normalized.includes('react') ? '⚛' : normalized.includes('node') ? '⬡' : normalized.includes('javascript') ? 'JS' : normalized.includes('next') ? 'N' : title.slice(0, 1).toUpperCase()
  const className = normalized.includes('javascript') ? 'course-mark course-mark-js' : normalized.includes('react') ? 'course-mark course-mark-react' : normalized.includes('node') ? 'course-mark course-mark-node' : normalized.includes('next') ? 'course-mark course-mark-next' : 'course-mark course-mark-default'
  return <span className={className} aria-hidden="true">{mark}</span>
}

function SearchCard({result, rank}: {result: VideoResult | LessonResult; rank: number}) {
  const lessonLabel = `Lesson ${result.moduleIndex + 1}.${result.lessonIndex + 1}`
  const captureOpen = () => posthog.capture('search:result_open', {
    result_type: result.kind,
    result_rank: rank,
    lesson_slug: result.lessonSlug,
    course_slug: result.courseSlug,
    matched_second: result.kind === 'video' ? result.matchedSeconds : null,
  })
  if (result.kind === 'video') {
    return <Link className="search-result-card video-result-card" href={result.href} onClick={captureOpen}>
      <div className="search-result-image">
        {result.posterUrl ? <Image src={result.posterUrl} alt="" fill sizes="(max-width: 700px) 100vw, 280px" /> : <span className="image-play-fallback"><Icon name="play" /></span>}
        <span className="video-image-play"><Icon name="play" /></span>
        <span className="search-time">{result.matchedLabel}</span>
      </div>
      <div className="search-result-copy">
        <div className="search-result-topline"><div className="search-result-context"><CourseMark title={result.courseTitle} /><span>{result.courseTitle}</span></div><span className="search-result-badge video-badge">VIDEO</span></div>
        <h2>{result.lessonTitle}</h2>
        <p>{result.description || 'Explore this lesson and find the exact concept you need.'}</p>
        <div className="search-result-meta"><span><Icon name="document" />{lessonLabel}</span><span><Icon name="folder" />{result.moduleTitle}</span></div>
        <div className="search-result-footer"><span className="search-duration">{formatTime(result.duration)}</span><span className="search-watch"><span className="watch-play"><Icon name="play" /></span>Watch from {result.matchedLabel}<Icon name="arrow" /></span></div>
      </div>
    </Link>
  }

  return <Link className="search-result-card lesson-result-card" href={result.href} onClick={captureOpen}>
    <div className="lesson-result-art"><Icon name="document" />{result.keyPoints.length > 0 ? <ul>{result.keyPoints.slice(0, 3).map((point) => <li key={point}>{point}</li>)}</ul> : null}<span className="lesson-complete"><Icon name="check" /></span></div>
    <div className="search-result-copy">
      <div className="search-result-topline"><div className="search-result-context"><CourseMark title={result.courseTitle} /><span>{result.courseTitle}</span></div><span className="search-result-badge lesson-badge">LESSON</span></div>
      <h2>{result.lessonTitle}</h2>
      <p>{result.description || 'Build a stronger understanding with this focused lesson.'}</p>
      <div className="lesson-module-label">Module {result.moduleIndex + 1}</div>
      <div className="search-result-footer"><span /><span className="search-watch">View lesson <Icon name="arrow" /></span></div>
    </div>
  </Link>
}

function SearchSkeleton() {
  return <div className="search-results-list" aria-hidden="true">{[0, 1, 2].map((index) => <div className="search-result-card search-skeleton-card" key={index}><div className="search-skeleton-thumb" /><div className="search-skeleton-copy"><span className="search-skeleton-line" style={{width: '22%'}} /><span className="search-skeleton-line" style={{width: '58%'}} /><span className="search-skeleton-line" style={{width: '92%'}} /><span className="search-skeleton-line" style={{width: '38%'}} /></div></div>)}</div>
}

export function SearchResults({initialQuery}: {initialQuery: string}) {
  const {isSignedIn} = useAuth()
  const [query, setQuery] = useState(initialQuery)
  const [data, setData] = useState<SearchResponse | null>(null)
  const [sort, setSort] = useState<'relevant' | 'lessons' | 'videos'>('relevant')
  const [loading, setLoading] = useState(Boolean(initialQuery.trim()))
  const [error, setError] = useState('')
  const activeRequestId = useRef(0)
  const activeController = useRef<AbortController | null>(null)

  const runSearch = async (value: string) => {
    const requestId = ++activeRequestId.current
    activeController.current?.abort()
    activeController.current = null
    const cleanQuery = value.trim()
    if (!cleanQuery) {
      setData(null)
      setError('')
      setLoading(false)
      return
    }

    const controller = new AbortController()
    activeController.current = controller
    setLoading(true)
    setError('')
    window.history.replaceState(null, '', `/search?q=${encodeURIComponent(cleanQuery)}`)
    try {
      const response = await fetch('/api/search', {method: 'POST', headers: {'content-type': 'application/json', ...getAnalyticsHeaders()}, body: JSON.stringify({query: cleanQuery}), signal: controller.signal})
      const body = await response.json()
      if (requestId !== activeRequestId.current) return
      if (!response.ok) throw new Error(body.error || 'Search failed')
      setData(body)
      posthog.capture('search:performed', {query_length: cleanQuery.length, result_count: body.total, course_count: body.courseCount})
    } catch (requestError) {
      if (requestId !== activeRequestId.current || (requestError instanceof DOMException && requestError.name === 'AbortError')) return
      setError(requestError instanceof Error ? requestError.message : 'Search failed')
      setData(null)
    } finally {
      if (requestId === activeRequestId.current) {
        activeController.current = null
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    if (!initialQuery.trim()) return
    const timer = window.setTimeout(() => { void runSearch(initialQuery) }, 0)
    return () => window.clearTimeout(timer)
  }, [initialQuery])

  useEffect(() => () => {
    activeRequestId.current += 1
    activeController.current?.abort()
  }, [])

  const visibleResults = useMemo(() => data?.results.filter((result) => sort === 'relevant' || result.kind === (sort === 'videos' ? 'video' : 'lesson')) ?? [], [data, sort])
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void runSearch(query) }
  const changeSort = (value: typeof sort) => {
    const visibleResultCount = data?.results.filter((result) => value === 'relevant' || result.kind === (value === 'videos' ? 'video' : 'lesson')).length ?? 0
    setSort(value)
    posthog.capture('search:sort_change', {sort_type: value, visible_result_count: visibleResultCount, total_result_count: data?.total ?? 0})
  }
  const hasQuery = Boolean(query.trim())

  return <main className="home-shell search-page-shell">
    <header className="home-header">
      <Link className="home-brand" href="/" aria-label="Vertex home"><span className="vertex-logo" aria-hidden="true">V</span><span>Vertex</span></Link>
      <nav className="home-nav" aria-label="Main navigation"><Link className="active" href="/courses">Courses</Link><Link href="/my-learning">My Learning</Link></nav>
      <div className="home-actions"><span className="icon-button" aria-hidden="true"><Icon name="bell" /></span>{isSignedIn ? <UserButton /> : <div className="auth-actions"><SignInButton mode="modal"><button className="auth-link" type="button">Sign in</button></SignInButton><SignUpButton mode="modal"><button className="auth-signup" type="button">Sign up</button></SignUpButton></div>}</div>
    </header>
    <section className="search-page-content" aria-labelledby="search-title">
      <div className="search-heading"><p className="eyebrow">Search results</p><h1 id="search-title">Results for <span>{hasQuery ? `“${query}”` : 'your learning'}</span></h1>{data && !loading ? <p className="search-count">Found {data.total} results across {data.courseCount} courses</p> : null}</div>
      <form className="search-form" role="search" onSubmit={submit}><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your courses..." aria-label="Search your courses" /><kbd>⌘ K</kbd></form>
      {loading ? <SearchSkeleton /> : error ? <div className="search-state search-error" role="alert">{error}</div> : !data ? <div className="search-state">Enter a topic to search your courses.</div> : data.total === 0 ? <div className="search-state"><h2>No lessons found</h2><p>Try a broader topic or browse the full course catalog.</p><Link className="browse-link" href="/courses">Browse all courses <Icon name="arrow" /></Link></div> : <><div className="search-toolbar"><p><strong>{data.total}</strong> results</p><label><span className="sr-only">Sort results</span><select value={sort} onChange={(event) => changeSort(event.target.value as typeof sort)}><option value="relevant">Most Relevant</option><option value="lessons">Lessons</option><option value="videos">Video moments</option></select></label></div><div className="search-results-list">{visibleResults.map((result, index) => <SearchCard result={result} rank={index + 1} key={`${result.kind}-${result.lessonSlug}-${index}`} />)}</div><div className="search-browse-callout"><span className="callout-icon"><Icon name="search" /></span><div><strong>Can’t find what you’re looking for?</strong><p>Try different keywords or browse our full course catalog.</p></div><Link href="/courses">Browse all courses <Icon name="arrow" /></Link></div></>}
    </section>
  </main>
}
