// Dynamic client registration, and the redirect URI rules that make it safe.
//
// An MCP client that has never seen this server registers itself before it can
// start a flow: it POSTs the redirect URIs it intends to use, and gets back a
// `client_id`. That is an unauthenticated write endpoint by design — RFC 7591
// open registration is what lets Claude and ChatGPT connect without anybody
// pre-provisioning credentials — so what it accepts has to be narrow.
//
// The redirect URI is the whole attack surface. It is the one value that
// decides where an authorization code is delivered, so a permissive rule here
// is an open redirect that hands out credentials. The rules below are
// deliberately stricter than RFC 7591 requires.

/** Registration is refused above this many URIs; a real client needs one or two. */
const MAX_REDIRECT_URIS = 5

/** Longest client name kept, so a registration cannot write an essay to the log. */
const MAX_NAME_LENGTH = 120

export type ClientRegistration = {
  clientName: string
  redirectUris: string[]
}

export type RegistrationError = { error: string; description: string }

/**
 * Whether a redirect URI may receive an authorization code.
 *
 * Three rules, each closing something specific:
 *
 * - **HTTPS only, except loopback.** A code delivered over plain HTTP is a code
 *   on the wire. Loopback is exempted because a desktop client redirects to
 *   `http://127.0.0.1:<port>/…` and cannot hold a certificate for it; that is
 *   the exemption RFC 8252 makes for native apps, and it is safe for the same
 *   reason — the traffic never leaves the machine.
 * - **No fragment.** RFC 6749 forbids it, and a fragment is where a naive
 *   client would put a token.
 * - **No wildcards, no userinfo, no `localhost` by name.** Matching is exact
 *   string equality at redemption time, so anything that makes two different
 *   URIs compare equal is a way to redirect a code somewhere else.
 *   `localhost` resolves through DNS and can be pointed anywhere; the literal
 *   loopback addresses cannot.
 */
export function isAllowedRedirectUri(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }

  if (url.hash) return false
  if (url.username || url.password) return false

  const loopback = url.hostname === '127.0.0.1' || url.hostname === '[::1]'
  if (url.protocol === 'http:') return loopback
  if (url.protocol !== 'https:') return false

  // A hostname that is still a template — `*.example.com`, `${host}` — would be
  // compared literally later and never match, but refusing it at registration
  // is a clearer failure than a redirect that silently never fires.
  return !/[*{}]/.test(url.hostname)
}

/**
 * Validates a registration request body.
 *
 * Returns either the fields worth storing or an RFC 7591 error. Everything the
 * client sends beyond these is discarded rather than persisted: `logo_uri`,
 * `client_uri`, `contacts`, and friends are display metadata this server never
 * shows, and storing attacker-supplied strings that a person will later read in
 * an admin panel is how a consent screen becomes a phishing page.
 */
export function validateRegistration(
  body: unknown,
): ClientRegistration | RegistrationError {
  if (typeof body !== 'object' || body === null) {
    return {
      error: 'invalid_client_metadata',
      description: 'The registration body must be a JSON object.',
    }
  }

  const input = body as Record<string, unknown>
  const uris = input.redirect_uris

  if (!Array.isArray(uris) || uris.length === 0) {
    return {
      error: 'invalid_redirect_uri',
      description: '`redirect_uris` is required and must be a non-empty array.',
    }
  }

  if (uris.length > MAX_REDIRECT_URIS) {
    return {
      error: 'invalid_redirect_uri',
      description: `At most ${MAX_REDIRECT_URIS} redirect URIs may be registered.`,
    }
  }

  if (
    !uris.every((uri) => typeof uri === 'string' && isAllowedRedirectUri(uri))
  ) {
    return {
      error: 'invalid_redirect_uri',
      description:
        'Every redirect URI must be an absolute https URL with no fragment, ' +
        'or an http URL on 127.0.0.1 or [::1].',
    }
  }

  // Only the grant this server implements. A client asking for anything else —
  // `implicit`, `password`, `client_credentials` — is told plainly rather than
  // registered and then refused later at the authorize endpoint.
  const grantTypes = input.grant_types
  if (Array.isArray(grantTypes)) {
    const allowed = new Set(['authorization_code', 'refresh_token'])
    const unsupported = grantTypes.filter(
      (grant) => typeof grant !== 'string' || !allowed.has(grant),
    )
    if (unsupported.length) {
      return {
        error: 'invalid_client_metadata',
        description:
          'Only the authorization_code and refresh_token grants are supported.',
      }
    }
  }

  const name =
    typeof input.client_name === 'string' && input.client_name.trim()
      ? input.client_name.trim().slice(0, MAX_NAME_LENGTH)
      : 'Unnamed MCP client'

  return { clientName: name, redirectUris: uris as string[] }
}

/** Exact match, because anything looser is an open redirect. */
export function redirectUriIsRegistered(
  candidate: string,
  registered: string[],
): boolean {
  return registered.includes(candidate)
}
