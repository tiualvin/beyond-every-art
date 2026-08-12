import { revalidateTag, unstable_cache } from 'next/cache'

/**
 * Cache tags, one per collection whose documents the public site reads.
 *
 * They are coarse on purpose. A per-document tag would purge less, but every
 * listing, feed, sitemap entry and topic count derived from a post would have
 * to remember to carry it, and the first one that forgot would serve stale
 * content until its timer ran out. Purging every post-derived entry when any
 * post changes costs one rebuild of a few queries and cannot go wrong.
 */
export const CONTENT_TAGS = {
  posts: 'content:posts',
  pages: 'content:pages',
  tags: 'content:tags',
  authors: 'content:authors',
  media: 'content:media',
  globals: 'content:globals',
} as const

export type ContentTag = (typeof CONTENT_TAGS)[keyof typeof CONTENT_TAGS]

/**
 * How long a cached read survives without being purged.
 *
 * On-demand purging is what keeps the site current; this is the backstop for
 * the case where it does not run — a document written straight to the database,
 * a hook that threw, a deploy mid-write. Ten minutes is short enough that
 * nobody is left looking at yesterday's archive and long enough that a crawler
 * working through 117 URLs does not re-query for each one.
 */
export const CONTENT_TTL_SECONDS = 600

/**
 * Wraps a read so its result is shared between requests.
 *
 * The routes themselves stay dynamic: they resolve `NEXT_PUBLIC_SITE_URL` at
 * render time for canonical URLs, feeds and JSON-LD, and the production image
 * is built without that variable, so a statically rendered page would bake
 * `localhost` into every one of them and cutover would not fix it. Caching the
 * database reads instead removes the round-trips — the actual cost per
 * visitor — while the rendered URLs stay whatever the running container says.
 *
 * `keyParts` names the query; Next.js adds the arguments, so one wrapper
 * serves every slug.
 */
export function cachedRead<A extends unknown[], R>(
  name: string,
  read: (...args: A) => Promise<R>,
  tags: ContentTag[],
): (...args: A) => Promise<R> {
  return unstable_cache(read, [name], { tags, revalidate: CONTENT_TTL_SECONDS })
}

/**
 * Drops the cached reads that a change to `tags` could have made wrong.
 *
 * Called from Payload hooks, which also run outside a request — the seed
 * scripts, the Ghost import, `payload migrate` — where Next.js has no cache to
 * purge and `revalidateTag` throws. That is not a failure worth aborting a
 * write for: the caches those runs would have purged do not exist yet, and a
 * running server's caches still expire on their own.
 */
export function revalidateContent(tags: ContentTag[]): void {
  for (const tag of tags) {
    try {
      revalidateTag(tag)
    } catch {
      // Outside a Next.js server context. See above.
    }
  }
}
