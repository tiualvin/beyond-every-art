// PKCE, which is the only thing standing between a stolen authorization code
// and a working token.
//
// The code travels back through the browser as a query parameter, so it passes
// through address bars, history, referrers, and anything holding the redirect.
// PKCE binds it to a secret the client kept: the client sends the SHA-256 of
// that secret up front, and has to produce the secret itself to redeem the
// code. An attacker with the code and no verifier gets nothing.
//
// `plain` is not implemented. OAuth 2.1 removed it, the MCP specification
// requires S256, and supporting it would mean a client could downgrade itself
// to no protection at all by asking politely.

import { createHash } from 'node:crypto'

import { digestsMatch } from './tokens'

/** The only challenge method accepted. */
export const CODE_CHALLENGE_METHOD = 'S256'

/**
 * Whether `verifier` is the pre-image of `challenge`.
 *
 * Both sides are compared as digests through `digestsMatch`, so the comparison
 * does not short-circuit on the first differing byte.
 */
export function verifyPkce(verifier: string, challenge: string): boolean {
  if (!verifier || !challenge) return false

  // RFC 7636: 43–128 characters from the unreserved set. Enforced because a
  // one-character verifier would satisfy the hash check while carrying no
  // entropy at all, and the length is the only thing that makes it a secret.
  if (verifier.length < 43 || verifier.length > 128) return false
  if (!/^[A-Za-z0-9\-._~]+$/.test(verifier)) return false

  const computed = createHash('sha256').update(verifier).digest('base64url')

  // Compared as hex so `digestsMatch` can read both sides as buffers of equal
  // length; base64url strings of differing length would fail on length alone,
  // which is fine, but hex keeps one comparison path for the whole module.
  return digestsMatch(
    Buffer.from(computed).toString('hex'),
    Buffer.from(challenge).toString('hex'),
  )
}
