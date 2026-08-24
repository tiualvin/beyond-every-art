// The redirect table, as the edge middleware sees it.
//
// Middleware runs on the edge runtime and cannot reach Postgres, so it fetches
// `/redirects-map` over HTTP from the app's own loopback address instead. That
// fetch sits in front of every page-like request whenever the cache is cold,
// which makes it the one dependency on the site that can stop everything rather
// than one route — so the three things that keep it from doing that live here,
// where they can be tested, rather than inline in `middleware.ts`:
//
//   1. **A deadline.** The middleware's `catch` handles a *rejected* fetch —
//      logging it and falling through — but a fetch that never settles is not a
//      rejection. A `/redirects-map` that hung, because the Postgres pool was
//      saturated or the route was stuck, hung every page behind it, including
//      every page with no redirect to look up.
//   2. **One refresh at a time.** The cache expiring under load meant every
//      request arriving in the same instant issued its own fetch: the site
//      quietly doubling its own request volume once a minute, at exactly the
//      moments it was busiest.
//   3. **The last good copy.** A map that worked a minute ago is a far better
//      answer than no map at all. Without this, one failed refresh turned every
//      migrated Ghost URL into a 404 until an attempt happened to succeed.

import {
  buildRedirectMap,
  type RedirectRecord,
  type ResolvedRedirect,
} from './redirects'

/**
 * The Node-runtime endpoint that publishes the table.
 *
 * With the trailing slash, because `next.config.ts` sets `trailingSlash: true`
 * — the unslashed form answers with a 308 to this one, and a redirect on the
 * hot path of every request the middleware cannot already answer is a cost
 * paid for nothing.
 */
export const REDIRECT_MAP_PATH = '/redirects-map/'

/** How long a fetched map is served before a refresh is attempted. */
export const REDIRECT_MAP_TTL_MS = 60_000

/**
 * How long the fetch is given before the request gives up on it.
 *
 * Enormous for a loopback request to the same process, and short enough that a
 * reader waiting on one notices nothing.
 */
export const REDIRECT_MAP_TIMEOUT_MS = 2_000

export type RedirectMapFailure = (error: unknown, servingStale: boolean) => void

export interface RedirectMapCacheOptions {
  /** Injected so tests do not need a listening server. */
  fetchImpl?: typeof fetch
  /** Reported once per failed refresh, never once per waiting request. */
  onFailure?: RedirectMapFailure
  timeoutMs?: number
  ttlMs?: number
}

type Entry = {
  map: Map<string, ResolvedRedirect>
  expiresAt: number
}

export class RedirectMapCache {
  private entry: Entry | null = null

  /** The refresh currently in flight, shared by everyone waiting on it. */
  private inflight: Promise<Map<string, ResolvedRedirect>> | null = null

  private readonly fetchImpl: typeof fetch
  private readonly onFailure: RedirectMapFailure
  private readonly timeoutMs: number
  private readonly ttlMs: number

  constructor(options: RedirectMapCacheOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args))
    this.onFailure = options.onFailure ?? (() => {})
    this.timeoutMs = options.timeoutMs ?? REDIRECT_MAP_TIMEOUT_MS
    this.ttlMs = options.ttlMs ?? REDIRECT_MAP_TTL_MS
  }

  /**
   * The current map, fetching one if what is held has expired.
   *
   * Rejects only when there is nothing to fall back on — a first load that
   * failed. Every later failure resolves with the last good copy, so a caller
   * that has ever succeeded never has to handle one.
   */
  async load(
    origin: string,
    now: number = Date.now(),
  ): Promise<Map<string, ResolvedRedirect>> {
    if (this.entry && this.entry.expiresAt > now) return this.entry.map

    if (!this.inflight) {
      this.inflight = this.refresh(origin).finally(() => {
        this.inflight = null
      })
    }

    try {
      return await this.inflight
    } catch (error) {
      // Reported by `refresh`, which runs once however many callers are waiting
      // on it. Doing it here instead turned one failure into a line per
      // request — the burst this exists to avoid.
      if (this.entry) return this.entry.map
      throw error
    }
  }

  private async refresh(
    origin: string,
  ): Promise<Map<string, ResolvedRedirect>> {
    try {
      const response = await this.fetchImpl(`${origin}${REDIRECT_MAP_PATH}`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      })

      if (!response.ok) {
        throw new Error(`redirects-map responded ${response.status}`)
      }

      const data = (await response.json()) as { redirects?: RedirectRecord[] }
      const map = buildRedirectMap(data.redirects ?? [])
      this.entry = { map, expiresAt: Date.now() + this.ttlMs }
      return map
    } catch (error) {
      // Whether this is a warning or an outage depends on what is already held,
      // and that is known here: nothing between this and `load`'s catch can
      // change it.
      this.onFailure(error, this.entry !== null)
      throw error
    }
  }
}
