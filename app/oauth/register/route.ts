import { NextResponse } from 'next/server'

import { mintClientId } from '@/lib/oauth/tokens'
import { validateRegistration } from '@/lib/oauth/clients'
import {
  issuerOrigin,
  MAX_OAUTH_BODY_BYTES,
  oauthEnabled,
} from '@/lib/oauth/config'
import { getPayloadClient } from '@/lib/payload'
import {
  clientKey,
  configuredLimit,
  FixedWindowRateLimiter,
  retryAfterSeconds,
} from '@/lib/security/rate-limit'
import { readBoundedText } from '@/lib/security/request-body'

// RFC 7591 dynamic client registration.
//
// This is an unauthenticated write endpoint, and it has to be: a connector that
// has never seen this server registers before it can begin a flow, and there is
// nobody to authenticate as at that point. That is the design the MCP
// specification assumes, and it is why every other control here is tight —
// registration produces no secret, grants no access, and reaches nothing. A
// registered client is an identity and a redirect URI, and it is worth exactly
// nothing until a person approves it on the consent screen.
//
// What it does cost is a row. So it is rate limited by source address, and the
// row it writes is small and bounded (`lib/oauth/clients.ts` caps the URI count
// and the name length).
//
// The body is bounded too, and that half was missing while the other three
// OAuth endpoints had it. The limiter caps how *often* this can be called; it
// cannot cap what one call costs, because the body has already been buffered by
// the time anything is counted. `request.json()` let the caller decide how much
// memory one registration allocated — twenty an hour, each as large as it liked,
// against a container with a 2 GB ceiling. `lib/oauth/clients.ts` bounds the URI
// count and the name length but not the length of a single URI string, so the
// ceiling here is what bounds that too.
export const dynamic = 'force-dynamic'

const REGISTRATIONS_PER_HOUR = 20

const limiter = new FixedWindowRateLimiter(
  configuredLimit('RATE_LIMIT_OAUTH_REGISTER_PER_HOUR', REGISTRATIONS_PER_HOUR),
  60 * 60_000,
)

export async function POST(request: Request): Promise<NextResponse> {
  if (!oauthEnabled() || !issuerOrigin()) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 })
  }

  const limit = limiter.check(clientKey(request.headers))
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: 'temporarily_unavailable',
        error_description: `Too many registrations from this address. Try again in ${retryAfterSeconds(limit.resetAt)} seconds.`,
      },
      {
        status: 429,
        headers: { 'Retry-After': String(retryAfterSeconds(limit.resetAt)) },
      },
    )
  }

  // Read once, bounded, before Payload is touched — the ordering
  // `tests/security/route-body-limits.test.ts` pins for the other endpoints.
  let body: unknown
  try {
    body = JSON.parse(await readBoundedText(request, MAX_OAUTH_BODY_BYTES))
  } catch {
    return NextResponse.json(
      {
        error: 'invalid_client_metadata',
        error_description: 'The registration body must be JSON.',
      },
      { status: 400 },
    )
  }

  const validated = validateRegistration(body)
  if ('error' in validated) {
    return NextResponse.json(
      { error: validated.error, error_description: validated.description },
      { status: 400 },
    )
  }

  const payload = await getPayloadClient()
  const clientId = mintClientId()

  await payload.create({
    collection: 'oauth-clients',
    data: {
      clientId,
      clientName: validated.clientName,
      redirectUris: validated.redirectUris,
    },
    overrideAccess: true,
  })

  // RFC 7591 §3.2.1. No `client_secret`: this is a public client, and PKCE is
  // what authenticates the token exchange. Saying so explicitly with
  // `token_endpoint_auth_method: 'none'` stops a client trying to present
  // credentials it was never issued.
  return NextResponse.json(
    {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: validated.clientName,
      grant_types: ['authorization_code', 'refresh_token'],
      redirect_uris: validated.redirectUris,
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    },
    { status: 201 },
  )
}
