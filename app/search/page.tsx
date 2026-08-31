import type {Metadata} from 'next'
import { SearchResults } from './search-results'
import './search.css'



export const metadata: Metadata = {
  title: 'Search | Vertex',
  description: 'Find the exact lessons you need across all your courses.',
}

export default async function SearchPage({searchParams}: {searchParams: Promise<{q?: string | string[]}>}) {
  const {q} = await searchParams
  const initialQuery = Array.isArray(q) ? q[0] ?? '' : q ?? ''
  return <SearchResults initialQuery={initialQuery} />
}
