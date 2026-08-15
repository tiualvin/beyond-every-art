// The query behind `/health`.
//
// It lives here rather than inline in the route because every option in it is
// load-bearing, and the version that reads more naturally is the expensive one.
//
// `/health` is not a quiet endpoint. The Compose healthcheck hits it every 30
// seconds for the lifetime of the container, the deploy verifies it from inside
// the network before swapping containers, and it is deliberately exempt from
// the staging Basic Auth gate in `middleware.ts` so an uptime monitor can reach
// it — which also means an anonymous caller can. It used to run
// `payload.count({ collection: 'posts' })`: a `COUNT(*)` whose cost grows with
// the table, to answer a question that has nothing to do with how many posts
// there are.

import type { Payload } from 'payload'

/**
 * Cheapest query that still proves the pool reaches Postgres.
 *
 * `pagination: false` is the option that matters, and the one most likely to be
 * removed by someone tidying up. Payload's find runs a separate `countDistinct`
 * for pagination metadata unless it is switched off — verified in
 * `@payloadcms/drizzle`'s `findMany` — so a find with `limit: 1` and pagination
 * left on issues *both* a `SELECT ... LIMIT 1` and the `COUNT(*)` this exists to
 * avoid. `limit` is still applied when pagination is off; only `limit: 0`
 * removes it.
 *
 * The rest keeps the row narrow: `depth: 0` populates no relationships, and
 * `select` asks for one column. `slug` rather than `id`, because `id` is not a
 * selectable key — Payload returns it on every document and leaves it out of
 * the generated `PostsSelect`, so asking for it is a type error against the
 * real types even though it reads like the obvious choice.
 *
 * The result is a single narrow row, constant time regardless of how large the
 * archive grows.
 */
export const HEALTH_PROBE_QUERY = {
  collection: 'posts',
  depth: 0,
  limit: 1,
  pagination: false,
  select: { slug: true },
} as const satisfies Parameters<Payload['find']>[0]
