import { describe, expect, it } from 'vitest'

import {
  SEAL_TTL_MS,
  openRequest,
  sealRequest,
  type AuthorizeRequest,
} from '../../lib/oauth/authorize-request'

const SECRET = 'test-secret-not-a-real-payload-secret'

const request = (over: Partial<AuthorizeRequest> = {}): AuthorizeRequest => ({
  clientId: 'bea_client_abc',
  clientName: 'Claude',
  codeChallenge: 'challenge',
  expiresAt: Date.now() + SEAL_TTL_MS,
  redirectUri: 'https://claude.ai/api/mcp/auth_callback',
  state: 'xyz',
  ...over,
})

describe('sealRequest / openRequest', () => {
  it('round-trips a request', () => {
    const original = request()
    expect(openRequest(sealRequest(original, SECRET), SECRET)).toEqual(original)
  })

  // The reason the seal exists. If the POST handler read `redirect_uri` from a
  // form field, editing it in the DOM would send the authorization code
  // somewhere else — so the request has to be unforgeable, not merely hidden.
  it('refuses a tampered payload', () => {
    const sealed = sealRequest(request(), SECRET)
    const [payload, signature] = sealed.split('.')
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString())
    decoded.redirectUri = 'https://evil.test/steal'
    const forged = Buffer.from(JSON.stringify(decoded)).toString('base64url')

    expect(openRequest(`${forged}.${signature}`, SECRET)).toBeNull()
  })

  it('refuses a seal signed with another secret', () => {
    expect(openRequest(sealRequest(request(), 'other'), SECRET)).toBeNull()
  })

  it('refuses an expired seal', () => {
    const stale = sealRequest(request({ expiresAt: Date.now() - 1 }), SECRET)
    expect(openRequest(stale, SECRET)).toBeNull()
  })

  it('refuses a seal with no expiry at all', () => {
    const payload = Buffer.from(
      JSON.stringify({ clientId: 'x', redirectUri: 'https://claude.ai/cb' }),
    ).toString('base64url')
    // Signed correctly, but missing the field — must still be refused rather
    // than treated as never expiring.
    const sealed = sealRequest(request(), SECRET)
    const signature = sealed.split('.')[1]
    expect(openRequest(`${payload}.${signature}`, SECRET)).toBeNull()
  })

  it.each(['', 'nodot', '.', '.sig'])(
    'refuses the malformed seal %j',
    (sealed) => {
      expect(openRequest(sealed, SECRET)).toBeNull()
    },
  )

  // A cross-site POST cannot mint one of these, which is what makes the consent
  // form safe without a separate CSRF token.
  it('cannot be produced without the secret', () => {
    const guessed = Buffer.from(JSON.stringify(request())).toString('base64url')
    expect(openRequest(`${guessed}.${'a'.repeat(43)}`, SECRET)).toBeNull()
  })
})
