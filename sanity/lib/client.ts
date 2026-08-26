import 'server-only'

import {createClient} from 'next-sanity'
import type {QueryParams} from '@sanity/client'

import {apiVersion, dataset, projectId} from '../env'

const clientConfig = {
  projectId,
  dataset,
  apiVersion,
  useCdn: true,
}

export const client = createClient(clientConfig)

export const serverClient = createClient({
  ...clientConfig,
  token: process.env.SANITY_API_READ_TOKEN,
})

export async function sanityFetch<T>({
  query,
  params = {},
  revalidate = 60,
  tags = [],
}: {
  query: string
  params?: QueryParams
  revalidate?: number | false
  tags?: string[]
}) {
  return serverClient.fetch<T>(query, params, {
    next: {
      revalidate: tags.length ? false : revalidate,
      tags,
    },
  })
}
