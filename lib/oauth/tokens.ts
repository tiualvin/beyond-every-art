// Secrets the OAuth layer mints, and how they are stored.
//
// Three kinds of value travel through this flow — an authorization code, an
// access token, and a refresh token — and all three are bearer secrets: whoever
// holds one can use it. So none of them is ever written to the database in a
// form that could be replayed if the database leaked. What is stored is an
// HMAC-SHA256 of the value under `PAYLOAD_SECRET`, which is the same
// construction the MCP API keys already use, and it inherits the same property:
// rotating `PAYLOAD_SECRET` invalidates every outstanding grant at once.
//
// The prefixes are load-bearing rather than decorative. `overrideAuth` has to
// decide, from the bearer token alone, whether a request is presenting an MCP
// API key or an OAuth access token, and a prefix makes that a string comparison
// instead of two database lookups against two collections on every request.
// They also make a leaked token identifiable in a log or a paste.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/** Marks an OAuth access token, so `overrideAuth` can route it without a lookup. */
export const ACCESS_TOKEN_PREFIX = 'bea_at_'

/** Marks a refresh token. Only ever presented at the token endpoint. */
export const REFRESH_TOKEN_PREFIX = 'bea_rt_'

/** Marks an authorization code. Only ever presented at the token endpoint. */
export const CODE_PREFIX = 'bea_ac_'

/** Marks a dynamically registered client. Not a secret; identifies, not authenticates. */
export const CLIENT_ID_PREFIX = 'bea_client_'

/**
 * 32 bytes of CSPRNG output, base64url.
 *
 * Well past the 128 bits of entropy OAuth 2.1 asks of a bearer value, and
 * URL-safe because every one of these travels in a query string or a form body
 * at some point in the flow.
 */
function secret(): string {
  return randomBytes(32).toString('base64url')
}

export const mintAccessToken = (): string => `${ACCESS_TOKEN_PREFIX}${secret()}`
export const mintRefreshToken = (): string =>
  `${REFRESH_TOKEN_PREFIX}${secret()}`
export const mintCode = (): string => `${CODE_PREFIX}${secret()}`
export const mintClientId = (): string => `${CLIENT_ID_PREFIX}${secret()}`

export const isAccessToken = (value: string): boolean =>
  value.startsWith(ACCESS_TOKEN_PREFIX)

/**
 * What gets stored, and what a presented value is looked up by.
 *
 * Keyed on `PAYLOAD_SECRET` rather than a bare digest so that the stored form
 * is useless without the application secret, and so that rotating that secret
 * revokes everything — the property the API keys already document.
 */
export function hashToken(value: string, payloadSecret: string): string {
  return createHmac('sha256', payloadSecret).update(value).digest('hex')
}

/**
 * Constant-time comparison for two hex digests.
 *
 * The lookup itself is by indexed hash, so the database has already done an
 * equality test by the time anything reaches here — this is for the places that
 * compare a second value on an already-found row (a rotated refresh token
 * against its record), where a short-circuiting `===` would leak how much of
 * the digest matched.
 */
export function digestsMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex')
  const right = Buffer.from(b, 'hex')
  if (left.length !== right.length || left.length === 0) return false
  return timingSafeEqual(left, right)
}

/**
 * How long each kind of secret lives.
 *
 * The code is short because it is single-use and travels through a browser
 * redirect, which is the most exposed leg of the flow. The access token is an
 * hour because it is presented on every MCP request and cannot be revoked
 * mid-life without a lookup this design deliberately avoids on the hot path —
 * revocation takes effect when it expires, and the refresh that would follow is
 * what gets refused. The refresh token is long because a connector that has to
 * re-consent every week is a connector nobody keeps.
 */
export const CODE_TTL_MS = 60_000
export const ACCESS_TOKEN_TTL_MS = 60 * 60_000
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60_000

/**
 * The ceiling that rotation cannot push.
 *
 * Every refresh moves `REFRESH_TOKEN_TTL_MS` another thirty days out, so on its
 * own a chain never ages out — a thief who keeps refreshing keeps access for as
 * long as they bother to. This is measured from the moment consent was given
 * and is never extended, so a grant has a definite end whatever happens to its
 * tokens.
 *
 * Ninety days is chosen to be long enough that re-approving is a chore rather
 * than an interruption, and short enough that an abandoned connector does not
 * outlive the person who set it up. The consequence is real and belongs in the
 * documentation rather than in a surprise: an unattended connector stops
 * working at ninety days until somebody approves it again.
 */
export const GRANT_ABSOLUTE_TTL_MS = 90 * 24 * 60 * 60_000
