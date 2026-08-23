import { NextResponse } from 'next/server'

import {
  issuerOrigin,
  MAX_OAUTH_BODY_BYTES,
  oauthEnabled,
} from '@/lib/oauth/config'
import { redeemCode, refreshGrant } from '@/lib/oauth/grants'
import { verifyPkce } from '@/lib/oauth/pkce'
import { getPayloadClient } from '@/lib/payload'
import {
  clientKey,
  configuredLimit,
  FixedWindowRateLimiter,
  retryAfterSeconds,
} from '@/lib/security/rate-limit'
import { readBoundedText } from '@/lib/security/request-body'

// The token endpoint. Two grants, both unauthenticated at the client level
// because every client here is public — PKCE is what proves the caller is the
// one that started the flow.
//
// Rate limited by source address for the same reason `/api/mcp` is: this is a
// public POST endpoint where every call costs a database lookup, and an
// unbounded one is a way to buy that work. It also bounds brute force against a
// code or refresh token, though the 256-bit values make that theoretical.
//
// `Cache-Control: no-store` is required by RFC 6749 §5.1 and is not a
// formality: these responses carry bearer tokens, and a cache anywhere on the
// path holding one is the whole flow undone.
export const dynamic = 'force-dynamic'

const TOKEN_REQUESTS_PER_MINUTE = 60

const limiter = new FixedWindowRateLimiter(
  configuredLimit(
    'RATE_LIMIT_OAUTH_TOKEN_PER_MINUTE',
    TOKEN_REQUESTS_PER_MINUTE,
  ),
  60_000,
)

const NO_STORE = { 'Cache-Control': 'no-store', Pragma: 'no-cache' }

const fail = (error: string, description: string, status = 400) =>
  NextResponse.json(
    { error, error_description: description },
    { status, headers: NO_STORE },
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
        error_description: `Too many token requests from this address. Try again in ${retryAfterSeconds(limit.resetAt)} seconds.`,
      },
      {
        status: 429,
        headers: {
          ...NO_STORE,
          'Retry-After': String(retryAfterSeconds(limit.resetAt)),
        },
      },
    )
  }

  // RFC 6749 §4.1.3 specifies a form-encoded body. Some clients send JSON
  // anyway; accepting both costs nothing and turns a silent "invalid_request"
  // into a working connection.
  let form: URLSearchParams
  const contentType = request.headers.get('content-type') ?? ''
  try {
    // Read once and bounded. The rate limiter caps how often this endpoint can
    // be called; this caps what one call costs, which is the half a limiter
    // cannot do — the body has already been buffered by the time it is counted.
    const raw = await readBoundedText(request, MAX_OAUTH_BODY_BYTES)
    if (contentType.includes('application/json')) {
      const body = JSON.parse(raw) as Record<string, unknown>
      form = new URLSearchParams(
        Object.entries(body).map(([key, value]) => [key, String(value)]),
      )
    } else {
      form = new URLSearchParams(raw)
    }
  } catch {
    return fail('invalid_request', 'The request body could not be parsed.')
  }

  const payload = await getPayloadClient()
  const grantType = form.get('grant_type')

  if (grantType === 'authorization_code') {
    const code = form.get('code')
    const verifier = form.get('code_verifier')
    const redirectUri = form.get('redirect_uri')

    if (!code || !verifier || !redirectUri) {
      return fail(
        'invalid_request',
        'code, code_verifier, and redirect_uri are all required.',
      )
    }

    const result = await redeemCode(payload, {
      code,
      codeVerifier: verifier,
      redirectUri,
      verifyPkce,
    })

    if ('error' in result) return fail(result.error, result.description)

    return NextResponse.json(
      {
        access_token: result.accessToken,
        expires_in: result.expiresIn,
        refresh_token: result.refreshToken,
        scope: 'mcp',
        token_type: 'Bearer',
      },
      { headers: NO_STORE },
    )
  }

  if (grantType === 'refresh_token') {
    const refreshToken = form.get('refresh_token')
    if (!refreshToken) {
      return fail('invalid_request', 'refresh_token is required.')
    }

    const result = await refreshGrant(payload, refreshToken)
    if ('error' in result) return fail(result.error, result.description)

    return NextResponse.json(
      {
        access_token: result.accessToken,
        expires_in: result.expiresIn,
        refresh_token: result.refreshToken,
        scope: 'mcp',
        token_type: 'Bearer',
      },
      { headers: NO_STORE },
    )
  }

  return fail(
    'unsupported_grant_type',
    'Only authorization_code and refresh_token are supported.',
  )
}
