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

export type RateLimitResult = {
  allowed: boolean
  /** Requests still available in the current window. */
  remaining: number
  /** When the current window resets, in epoch milliseconds. */
  resetAt: number
}

type Window = { count: number; resetAt: number }

export class FixedWindowRateLimiter {
  private readonly windows = new Map<string, Window>()

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  check(key: string, now: number = Date.now()): RateLimitResult {
    this.evictExpired(now)

    const existing = this.windows.get(key)
    if (!existing || existing.resetAt <= now) {
      const resetAt = now + this.windowMs
      this.windows.set(key, { count: 1, resetAt })
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

  /**
   * Drop finished windows so a stream of distinct keys — which is what an
   * unauthenticated flood looks like — cannot grow the map without bound.
   */
  private evictExpired(now: number): void {
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
 * `CF-Connecting-IP` is only consulted when `TRUST_CLOUDFLARE_IP` is set,
 * because it is trustworthy exactly when Cloudflare is proxying and forgeable
 * by anyone the moment it is not — which is the situation today. Turning that
 * variable on is part of the cutover to a proxied origin, not something to set
 * ahead of it.
 *
 * A request with no usable address falls into one shared bucket rather than
 * being waved through: that bucket is small, and a flood that arrives without
 * any forwarding header is precisely what should be throttled hardest.
 */
export function clientKey(
  headers: Headers,
  env: Record<string, string | undefined> = process.env,
): string {
  if (env.TRUST_CLOUDFLARE_IP) {
    const cloudflare = headers.get('cf-connecting-ip')?.trim()
    if (cloudflare) return `ip:${cloudflare}`
  }

  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    const hops = forwarded
      .split(',')
      .map((hop) => hop.trim())
      .filter(Boolean)
    const peer = hops[hops.length - 1]
    if (peer) return `ip:${peer}`
  }

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
