// A small fixed-window limiter for the MCP endpoint.
//
// `/api/mcp` is a public POST endpoint whose only credential is a bearer key,
// and every request — including one with a wrong key — costs a database lookup
// before it can be rejected. Caddy's standard build has no rate limiting, so
// this lives in the request path instead.
//
// It is in-process and per-container on purpose. The deployment runs a single
// app container, and a limiter that needs Redis to work is a limiter that is
// not there when it matters. It bounds abuse; it is not a defence against a
// distributed attacker, and nothing else should be built on top of it.

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
 * Identifies a caller for limiting purposes.
 *
 * Keyed on the presented credential, not on an IP: the requests come from a
 * vendor's cloud, so their source addresses are shared and unstable. A caller
 * with no credential is bucketed as `anonymous`, which is the bucket that
 * protects the key lookup itself.
 */
export function rateLimitKey(authorizationHeader: string | null): string {
  const token = authorizationHeader?.replace(/^Bearer\s+/i, '').trim()
  if (!token) return 'anonymous'
  // Only the tail, so the log and any heap dump never carry a usable key.
  return `key:${token.slice(-8)}`
}
