import 'server-only'

import {createMCPClient, type MCPClient} from '@ai-sdk/mcp'

import {dataset, projectId} from '../env'

const CACHE_TTL_MS = 5 * 60 * 1000
const DEFAULT_CONTEXT_VERSION = '2026-03-03'

let cachedClient: MCPClient | null = null
let cachedInitialContext: string | null = null
let initialContextCachedAt = 0

function getMcpUrl() {
  const slug = process.env.SANITY_CONTEXT_SLUG
  const base = process.env.SANITY_CONTEXT_MCP_URL || `https://api.sanity.io/v${DEFAULT_CONTEXT_VERSION}/context/mcp/${projectId}/${dataset}`
  return slug ? `${base.replace(/\/$/, '')}/${encodeURIComponent(slug)}` : base
}

function getInitialContextUrl(mcpUrl: string) {
  return `${mcpUrl.replace(/\/$/, '')}/initial-context`
}

async function getInitialContext(mcpUrl: string) {
  if (cachedInitialContext && Date.now() - initialContextCachedAt < CACHE_TTL_MS) return cachedInitialContext

  const response = await fetch(getInitialContextUrl(mcpUrl), {
    headers: {Authorization: `Bearer ${process.env.SANITY_API_READ_TOKEN}`},
    next: {revalidate: 300},
  })

  if (!response.ok) return cachedInitialContext
  cachedInitialContext = await response.text()
  initialContextCachedAt = Date.now()
  return cachedInitialContext
}

export async function createSearchContext(): Promise<{client: MCPClient; initialContext: string | null}> {
  const token = process.env.SANITY_API_READ_TOKEN
  if (!token) throw new Error('SANITY_API_READ_TOKEN is not configured')

  const url = getMcpUrl()
  if (cachedClient) {
    return {client: cachedClient, initialContext: await getInitialContext(url)}
  }

  const [client, initialContext] = await Promise.all([
    createMCPClient({
      transport: {type: 'http', url, headers: {Authorization: `Bearer ${token}`}},
    }),
    getInitialContext(url),
  ])

  cachedClient = client
  return {client, initialContext}
}

export async function disposeSearchContext() {
  const client = cachedClient
  cachedClient = null
  cachedInitialContext = null
  initialContextCachedAt = 0
  try {
    await client?.close()
  } catch {
    // the client is already discarded; nothing useful to do with a close failure
  }
}
