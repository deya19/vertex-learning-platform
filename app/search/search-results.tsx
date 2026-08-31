'use client'

import Image from 'next/image'
import Link from 'next/link'
import {FormEvent, useEffect, useMemo, useState} from 'react'

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

function Icon({name}: {name: 'search' | 'arrow' | 'play' | 'clock'}) {
  const content = {
    search: <><circle cx="10.8" cy="10.8" r="7.2" /><path d="m16.2 16.2 5 5" /></>,
    arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
    play: <path d="m9 6 9 6-9 6V6Z" />,
    clock: <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>,
  }[name]
  return <svg viewBox="0 0 24 24" aria-hidden="true">{content}</svg>
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  return `${minutes} min`
}

function SearchCard({result}: {result: VideoResult | LessonResult}) {
  const lessonLabel = `Lesson ${result.moduleIndex + 1}.${result.lessonIndex + 1}`
  if (result.kind === 'video') {
    return <Link className="search-result-card video-result-card" href={result.href}>
      <div className="search-result-image">{result.posterUrl ? <Image src={result.posterUrl} alt="" fill sizes="(max-width: 700px) 100vw, 280px" /> : <span><Icon name="play" /></span>}<mark className="search-result-badge video-badge">VIDEO</mark><span className="search-time"><Icon name="clock" />{result.matchedLabel}</span></div>
      <div className="search-result-copy"><div className="search-result-context"><span>{result.courseTitle}</span><b>•</b><span>{lessonLabel} in {result.moduleTitle}</span></div><h2>{result.lessonTitle}</h2><p>{result.description}</p><div className="search-result-footer"><span>{formatDuration(result.duration)}</span><span className="search-watch">Watch from {result.matchedLabel} <Icon name="arrow" /></span></div></div>
    </Link>
  }

  return <Link className="search-result-card lesson-result-card" href={result.href}>
    <div className="lesson-result-mark"><span>V</span><mark className="search-result-badge lesson-badge">LESSON</mark></div>
    <div className="search-result-copy"><div className="search-result-context"><span>{result.courseTitle}</span><b>•</b><span>{lessonLabel} in {result.moduleTitle}</span></div><h2>{result.lessonTitle}</h2><p>{result.description}</p>{result.keyPoints.length ? <ul>{result.keyPoints.slice(0, 3).map((point) => <li key={point}>{point}</li>)}</ul> : null}<div className="search-result-footer"><span>Lesson</span><span className="search-watch">View lesson <Icon name="arrow" /></span></div></div>
  </Link>
}

export function SearchResults({initialQuery}: {initialQuery: string}) {
  const [query, setQuery] = useState(initialQuery)
  const [data, setData] = useState<SearchResponse | null>(null)
  const [sort, setSort] = useState<'relevant' | 'lessons' | 'videos'>('relevant')
  const [loading, setLoading] = useState(Boolean(initialQuery.trim()))
  const [error, setError] = useState('')

  const runSearch = async (value: string) => {
    const cleanQuery = value.trim()
    if (!cleanQuery) { setData(null); return }
    setLoading(true); setError('')
    window.history.replaceState(null, '', `/search?q=${encodeURIComponent(cleanQuery)}`)
    try {
      const response = await fetch('/api/search', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({query: cleanQuery})})
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Search failed')
      setData(body)
      posthog.capture('search_performed', {query: cleanQuery, result_count: body.total})
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Search failed')
      setData(null)
    } finally { setLoading(false) }
  }

  useEffect(() => {
    if (!initialQuery.trim()) return
    const timer = window.setTimeout(() => { void runSearch(initialQuery) }, 0)
    return () => window.clearTimeout(timer)
  }, [initialQuery])

  const visibleResults = useMemo(() => data?.results.filter((result) => sort === 'relevant' || result.kind === (sort === 'videos' ? 'video' : 'lesson')) ?? [], [data, sort])
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void runSearch(query) }

  return <main className="home-shell search-page-shell">
    <header className="home-header"><Link className="home-brand" href="/" aria-label="Vertex home"><span className="vertex-logo" aria-hidden="true">V</span><span>Vertex</span></Link><nav className="home-nav" aria-label="Main navigation"><Link href="/courses">Courses</Link><Link href="/my-learning">My Learning</Link></nav><div className="home-actions"><Link className="search-header-link" href="/search" aria-label="Search"><Icon name="search" /></Link></div></header>
    <section className="search-page-content" aria-labelledby="search-title">
      <p className="eyebrow">Intelligent learning</p><h1 id="search-title">Search your learning.</h1><p className="search-intro">Find the exact lesson or video moment you need across all your courses.</p>
      <form className="search-form" role="search" onSubmit={submit}><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ask anything about your learning..." aria-label="Search your learning" /><button type="submit">Search</button></form>
      {loading ? <div className="search-state">Searching across your courses...</div> : error ? <div className="search-state search-error" role="alert">{error}</div> : !data ? <div className="search-state">Enter a question to search your learning.</div> : data.total === 0 ? <div className="search-state"><h2>No lessons found</h2><p>Try a broader topic or explore the full catalog.</p><Link className="search-empty-link" href="/courses">Explore all courses <Icon name="arrow" /></Link></div> : <><div className="search-toolbar"><p>Found <strong>{data.total}</strong> results across <strong>{data.courseCount}</strong> courses</p><label>Sort by <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="relevant">Most relevant</option><option value="lessons">Lessons</option><option value="videos">Video moments</option></select></label></div><div className="search-results-list">{visibleResults.map((result, index) => <SearchCard result={result} key={`${result.kind}-${result.lessonSlug}-${index}`} />)}</div></>}
    </section>
  </main>
}
