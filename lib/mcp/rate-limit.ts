// Rate limiting for the MCP endpoint.
//
// The limiter itself now lives in `lib/security/rate-limit.ts`, because the
// reasoning that justified it here — `/api/mcp` is a public POST endpoint whose
// only credential is a bearer key, and every request including one with a wrong
// key costs a database lookup before it can be rejected — turned out to apply
// to the rest of the public surface too. What stays here is how an MCP caller
// is identified, which is specific to this endpoint.

export {
  clientKey,
  configuredLimit,
  FixedWindowRateLimiter,
  type RateLimitResult,
  retryAfterSeconds,
} from '../security/rate-limit'

/**
 * Identifies a caller for limiting purposes.
 *
 * Keyed on the presented credential, not on an IP: the requests come from a
 * vendor's cloud, so their source addresses are shared and unstable. A caller
 * with no credential is bucketed as `anonymous`.
 *
 * This bounds how fast a *given* credential may be spent, and nothing more.
 * The caller chooses what it presents, so a run of guessed keys is a run of
 * distinct buckets, each starting with a full allowance — which is why key
 * guessing is bounded separately, by source address, in `plugin.ts`. Reading
 * this key as a bound on unauthenticated attempts is the mistake worth naming
 * here rather than rediscovering.
 */
export function rateLimitKey(authorizationHeader: string | null): string {
  const token = authorizationHeader?.replace(/^Bearer\s+/i, '').trim()
  if (!token) return 'anonymous'
  // Only the tail, so the log and any heap dump never carry a usable key.
  return `key:${token.slice(-8)}`
}
