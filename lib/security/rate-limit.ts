// A small fixed-window limiter, shared by every endpoint that a stranger can
// reach without a credential.
//
// It started life in `lib/mcp/rate-limit.ts` guarding the MCP endpoint, and the
// reasoning that put it there applies to the rest of the public surface too:
// Caddy's standard build has no rate limiting, and Cloudflare is DNS-only
// today (see docs/EDGE_PROTECTION.md), so nothing in front of the application
// bounds request volume. Until that changes this is the only bound there is.
//
// It is in-process and per-container on purpose. The deployment runs a single
// app container, and a limiter that needs Redis to work is a limiter that is
// not there when it matters. It bounds abuse and accidental loops; it is not a
// defence against a distributed attacker, and nothing else should be built on
// top of it.

import { isCloudflareAddress } from './cloudflare'

export type RateLimitResult = {
  allowed: boolean
  /** Requests still available in the current window. */
  remaining: number
  /** When the current window resets, in epoch milliseconds. */
  resetAt: number
}

type Window = { count: number; resetAt: number }

/**
 * Distinct keys one limiter will track before it stops opening new buckets.
 *
 * There has to be a ceiling, because for some limiters the key is chosen by the
 * caller: the MCP limiter buckets on the presented credential, so a run of
 * guessed keys is a run of distinct keys. Ten thousand windows is far more than
 * any real deployment of this size produces and small enough to be irrelevant
 * next to the container's memory ceiling.
 */
export const DEFAULT_MAX_KEYS = 10_000

/**
 * Where keys go once the ceiling is reached: one shared bucket, counted like
 * any other. Overflowing into a bucket rather than waving the request through
 * means a key-space flood throttles itself instead of buying an allowance per
 * request — and it cannot collide with a real key, because `clientKey` and
 * `rateLimitKey` both prefix theirs.
 */
const OVERFLOW_KEY = '\u0000overflow'

export class FixedWindowRateLimiter {
  private readonly windows = new Map<string, Window>()

  /** When the next full sweep is due; see `maybeSweep`. */
  private nextSweepAt = 0

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys: number = DEFAULT_MAX_KEYS,
  ) {}

  /**
   * Whether `key` would be allowed, without spending anything.
   *
   * For limiters that only count failures: the caller tests before doing the
   * expensive work and records against the key afterwards, only if the work
   * turned out to be a failure. A `check` in that position would count every
   * success too, and throttle exactly the callers it should not.
   *
   * Resolved through `resolveKey`, the same as `check`, and that is the whole
   * point rather than tidiness. This used to read `windows` directly, so once
   * the map was full the two disagreed: `check` diverted a new key into the
   * overflow bucket and counted there, while `peek` looked the raw key up,
   * found nothing, and answered "allowed" — for every new key, indefinitely.
   * A limiter that gates on `peek` therefore stopped gating at exactly the
   * moment a flood filled the map, which is the moment it was needed. The one
   * that matters is `failedAuthLimiter` in lib/mcp/plugin.ts: it is what bounds
   * guessing at an MCP key, and unbounded guessing is a different class of
   * problem from a slow endpoint.
   */
  peek(key: string, now: number = Date.now()): RateLimitResult {
    this.maybeSweep(now)

    const existing = this.windows.get(this.resolveKey(key, now))
    if (!existing || existing.resetAt <= now) {
      return {
        allowed: true,
        remaining: this.limit,
        resetAt: now + this.windowMs,
      }
    }

    return {
      allowed: existing.count < this.limit,
      remaining: Math.max(0, this.limit - existing.count),
      resetAt: existing.resetAt,
    }
  }

  check(key: string, now: number = Date.now()): RateLimitResult {
    this.maybeSweep(now)

    const resolved = this.resolveKey(key, now)
    const existing = this.windows.get(resolved)
    if (!existing || existing.resetAt <= now) {
      const resetAt = now + this.windowMs
      this.windows.set(resolved, { count: 1, resetAt })
      return { allowed: true, remaining: this.limit - 1, resetAt }
    }

    if (existing.count >= this.limit) {
      return { allowed: false, remaining: 0, resetAt: existing.resetAt }
    }

    existing.count += 1
    return {
      allowed: true,
      remaining: this.limit - existing.count,
      resetAt: existing.resetAt,
    }
  }

  /** Windows currently held. Exposed for tests; not part of the policy. */
  get size(): number {
    return this.windows.size
  }

  /**
   * The bucket a key actually lands in.
   *
   * A key already being tracked always keeps its own window. A new one gets
   * one while there is room; when there is not, finished windows are swept
   * first — which is normally enough, since a window only lives for
   * `windowMs` — and anything still over the ceiling shares the overflow
   * bucket.
   */
  private resolveKey(key: string, now: number): string {
    if (this.windows.has(key)) return key
    if (this.windows.size < this.maxKeys) return key

    this.sweep(now)
    return this.windows.size < this.maxKeys ? key : OVERFLOW_KEY
  }

  /**
   * Sweep at most once per window rather than on every request.
   *
   * The sweep is a full scan, so doing it per request made each request cost
   * one step per tracked key: a flood of distinct keys was quadratic work on
   * top of the memory it consumed. Expiry itself does not depend on the sweep —
   * `check` and `peek` both treat a window whose `resetAt` has passed as gone —
   * so this only reclaims memory, and once per window is often enough for that.
   */
  private maybeSweep(now: number): void {
    if (now < this.nextSweepAt) return
    this.sweep(now)
  }

  private sweep(now: number): void {
    this.nextSweepAt = now + this.windowMs
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key)
    }
  }
}

/**
 * Where a request came from, for limiting purposes.
 *
 * Every public request reaches the application through Caddy, which appends the
 * peer it actually accepted the connection from to `X-Forwarded-For`. A client
 * can send that header itself, so only the **last** entry means anything: the
 * ones in front of it are whatever the client chose to claim.
 *
 * `CF-Connecting-IP` is consulted only when `TRUST_CLOUDFLARE_IP` is set *and*
 * the peer is one of Cloudflare's own addresses. The variable alone is not
 * enough, and treating it as enough is what made every limiter here bypassable:
 * the header is trustworthy exactly when Cloudflare wrote it, and forgeable by
 * anyone the moment something else can reach the application. Two things mean
 * something else can — `docs/EDGE_PROTECTION.md` step 6 is open, so the origin
 * address still answers directly, and `cms` is deliberately never proxied, so
 * on that hostname the header is forgeable permanently. Rotating it per request
 * bought a fresh bucket per request, which is every limiter switched off by one
 * header.
 *
 * The peer is the part a caller cannot choose, so it is the part that decides.
 * See `lib/security/cloudflare.ts` for the ranges and why a stale list fails
 * safely.
 *
 * A request with no usable address falls into one shared bucket rather than
 * being waved through: that bucket is small, and a flood that arrives without
 * any forwarding header is precisely what should be throttled hardest.
 */
export function clientKey(
  headers: Headers,
  env: Record<string, string | undefined> = process.env,
): string {
  const forwarded = headers.get('x-forwarded-for')
  const hops = forwarded
    ? forwarded
        .split(',')
        .map((hop) => hop.trim())
        .filter(Boolean)
    : []
  const peer = hops[hops.length - 1]

  // The peer decides whether the Cloudflare header means anything, so it is
  // read first even though it is the fallback.
  if (env.TRUST_CLOUDFLARE_IP && isCloudflareAddress(peer)) {
    const cloudflare = headers.get('cf-connecting-ip')?.trim()
    if (cloudflare) return `ip:${cloudflare}`
  }

  if (peer) return `ip:${peer}`

  return 'ip:unknown'
}

/**
 * A limit that an operator — or a test run — can raise without a code change.
 *
 * The defaults are the real policy and are set at each call site; this exists
 * because the right number depends on things the code cannot see. Two in
 * particular: the end-to-end suite drives every flow from one address, so a
 * production-tight limit would make it flake rather than pass; and once
 * Cloudflare is proxying (docs/EDGE_PROTECTION.md) these become a second line
 * behind a real WAF and can reasonably be loosened.
 *
 * A missing, malformed, or non-positive value falls back to the default rather
 * than failing, so a typo in `.env` cannot quietly disable a limiter.
 */
export function configuredLimit(
  name: string,
  fallback: number,
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

/** Whole seconds until the window resets, for a `Retry-After` header. */
export function retryAfterSeconds(
  resetAt: number,
  now: number = Date.now(),
): number {
  return Math.max(1, Math.ceil((resetAt - now) / 1000))
}

/** The body, status and headers every throttled endpoint answers with. */
export const TOO_MANY_REQUESTS_BODY = { error: 'Too many requests' } as const

export function tooManyRequestsInit(resetAt: number): ResponseInit {
  return {
    status: 429,
    headers: { 'Retry-After': String(retryAfterSeconds(resetAt)) },
  }
}

/** Convenience for route handlers, which return a plain `Response`. */
export function tooManyRequests(resetAt: number): Response {
  return Response.json(TOO_MANY_REQUESTS_BODY, tooManyRequestsInit(resetAt))
}
