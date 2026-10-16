// The one module that talks to the content API.
//
// Every response is validated against the contract before anything else sees
// it, so a screen holds either a value of the type it was promised or an error
// — never a shape it has to second-guess. Every request URL ends in `/`; the
// website's `trailingSlash: true` would otherwise answer each call with a 308.

import type { z } from 'zod/v4'

import {
  API_PREFIX,
  AuthorListResponseSchema,
  AuthorResponseSchema,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_SEARCH_LENGTH,
  PostListResponseSchema,
  PostResponseSchema,
  SearchResponseSchema,
  TagListResponseSchema,
  TagResponseSchema,
  apiPaths,
  markUnsupported,
  type AuthorListResponse,
  type AuthorResponse,
  type PostDetail,
  type PostListResponse,
  type SearchResponse,
  type TagListResponse,
  type TagResponse,
} from './contract'

/** The part of a `fetch` Response the client reads. */
export type TransportResponse = { status: number; json(): Promise<unknown> }

/** How a request reaches a server: `fetch`, or the fixtures. */
export type Transport = (url: string) => Promise<TransportResponse>

export type ApiErrorKind = 'network' | 'status' | 'invalid'

export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    readonly url: string,
    message: string,
    readonly status: number | null = null,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export const fetchTransport: Transport = async (url) => {
  const response = await fetch(url, { headers: { Accept: 'application/json' } })
  return { status: response.status, json: () => response.json() }
}

/** The search term as the server will search for it, so caches agree. */
export function normaliseQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ').slice(0, MAX_SEARCH_LENGTH)
}

/** A page size the server will honour as asked. */
export function clampPageSize(limit: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_PAGE_SIZE
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(limit)))
}

/**
 * A post response with unknown node types marked, so one node a newer server
 * invented costs that node rather than the whole article.
 */
function withUnknownNodesMarked(json: unknown): unknown {
  const post = (json as { post?: { body?: unknown } } | null)?.post
  if (!post || typeof post !== 'object') return json
  return { ...json!, post: { ...post, body: markUnsupported(post.body) } }
}

export type ApiClient = ReturnType<typeof createApiClient>

export function createApiClient({
  baseUrl,
  transport,
}: {
  baseUrl: string
  transport: Transport
}) {
  const prefix = new URL(API_PREFIX, baseUrl)

  async function get<T>(
    path: string,
    schema: z.ZodType<T>,
    {
      notFound = 'throw',
      prepare = (json: unknown) => json,
    }: {
      notFound?: 'throw' | 'null'
      prepare?: (json: unknown) => unknown
    } = {},
  ): Promise<T | null> {
    const url = new URL(path, prefix).toString()

    let response: TransportResponse
    try {
      response = await transport(url)
    } catch (error) {
      throw new ApiError(
        'network',
        url,
        error instanceof Error ? error.message : 'The request failed.',
      )
    }

    if (response.status === 404 && notFound === 'null') return null
    if (response.status !== 200) {
      throw new ApiError(
        'status',
        url,
        `The server answered ${response.status}.`,
        response.status,
      )
    }

    let json: unknown
    try {
      json = await response.json()
    } catch {
      throw new ApiError('invalid', url, 'The response was not JSON.', 200)
    }

    const parsed = schema.safeParse(prepare(json))
    if (!parsed.success) {
      throw new ApiError(
        'invalid',
        url,
        `The response did not match the contract: ${parsed.error.issues
          .slice(0, 3)
          .map((issue) => `${issue.path.join('.')} ${issue.message}`)
          .join('; ')}`,
        200,
      )
    }
    return parsed.data
  }

  const required = <T>(value: T | null): T => value as T

  return {
    listPosts: async ({
      page = 1,
      limit = DEFAULT_PAGE_SIZE,
    }: { page?: number; limit?: number } = {}): Promise<PostListResponse> =>
      required(
        await get(
          apiPaths.posts(Math.max(1, Math.trunc(page)), clampPageSize(limit)),
          PostListResponseSchema,
        ),
      ),

    /** A post, or null when no live post has this slug. */
    getPost: async (slug: string): Promise<PostDetail | null> =>
      (
        await get(apiPaths.post(slug), PostResponseSchema, {
          notFound: 'null',
          prepare: withUnknownNodesMarked,
        })
      )?.post ?? null,

    listTags: async (): Promise<TagListResponse> =>
      required(await get(apiPaths.tags(), TagListResponseSchema)),

    getTag: (slug: string): Promise<TagResponse | null> =>
      get(apiPaths.tag(slug), TagResponseSchema, { notFound: 'null' }),

    listAuthors: async (): Promise<AuthorListResponse> =>
      required(await get(apiPaths.authors(), AuthorListResponseSchema)),

    getAuthor: (slug: string): Promise<AuthorResponse | null> =>
      get(apiPaths.author(slug), AuthorResponseSchema, { notFound: 'null' }),

    search: async (query: string): Promise<SearchResponse> => {
      const term = normaliseQuery(query)
      if (!term) return { query: '', posts: [] }
      return required(await get(apiPaths.search(term), SearchResponseSchema))
    },
  }
}
