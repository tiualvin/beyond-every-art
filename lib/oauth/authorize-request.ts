// The authorization request, carried across the consent screen without being
// trusted to the form.
//
// The browser sees the consent page twice: a GET that renders it, and a POST
// that approves it. Everything that matters — which client, which redirect URI,
// which PKCE challenge — arrives on the GET, and has to survive to the POST.
// Putting those in hidden form fields would mean the POST handler reads its
// most security-critical inputs from a document the user can edit: change
// `redirect_uri` in the DOM, press Approve, and the code goes elsewhere.
//
// So the GET validates them once, then seals them into a single opaque field
// signed with `PAYLOAD_SECRET`. The POST verifies the signature and reads the
// request from inside it, ignoring every other field on the form. A tampered
// value fails the signature; a value from another deployment fails it too.
//
// **This is not the CSRF defence, and an earlier version of this comment said
// it was.** A seal is a bearer value, not a per-session token: anyone who can
// load the consent page can obtain one, and until `userId` was added below,
// nothing stopped a seal minted for one person being posted with somebody
// else's cookie. What actually holds that door shut is Payload's `SameSite=Lax`
// session cookie and its `csrf` origin allowlist, both of which refuse a forged
// cross-site POST before this code runs. The seal's jobs are narrower and worth
// stating exactly: it makes the request tamper-evident, it expires, and — with
// `userId` — it binds the approval to the person the consent screen was
// rendered for.

import { createHmac, timingSafeEqual } from 'node:crypto'

export type AuthorizeRequest = {
  clientId: string
  clientName: string
  codeChallenge: string
  /** Milliseconds since epoch; the seal is refused after this. */
  expiresAt: number
  redirectUri: string
  resource?: string
  state?: string
  /**
   * The user the consent screen was rendered for.
   *
   * Compared against the session on the POST, so a seal cannot be carried to
   * another person's browser and approved there. Without it the grant is
   * written against whoever's cookie arrives with the form, which is not what
   * the person who started the flow agreed to.
   */
  userId: number | string
}

/** A consent page left open for longer than this has to be started again. */
export const SEAL_TTL_MS = 10 * 60_000

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export function sealRequest(request: AuthorizeRequest, secret: string): string {
  const payload = Buffer.from(JSON.stringify(request)).toString('base64url')
  return `${payload}.${sign(payload, secret)}`
}

/**
 * Opens a sealed request, or returns null.
 *
 * Null for a bad signature, a malformed blob, and an expired one alike: the
 * caller's only correct response to any of them is to refuse and make the
 * client start again, and collapsing them means the handler cannot accidentally
 * treat "expired" as "close enough".
 */
export function openRequest(
  sealed: string,
  secret: string,
): AuthorizeRequest | null {
  const separator = sealed.lastIndexOf('.')
  if (separator <= 0) return null

  const payload = sealed.slice(0, separator)
  const presented = sealed.slice(separator + 1)
  const expected = sign(payload, secret)

  const a = Buffer.from(presented)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  let request: AuthorizeRequest
  try {
    request = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return null
  }

  if (
    typeof request?.expiresAt !== 'number' ||
    request.expiresAt <= Date.now()
  ) {
    return null
  }

  return request
}
