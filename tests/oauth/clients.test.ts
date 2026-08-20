import { describe, expect, it } from 'vitest'

import {
  isAllowedRedirectUri,
  redirectUriIsRegistered,
  validateRegistration,
} from '../../lib/oauth/clients'

// The redirect URI decides where an authorization code is delivered. Every case
// below is a way of making it point somewhere it should not.
describe('isAllowedRedirectUri', () => {
  it('accepts the address Claude actually uses', () => {
    expect(
      isAllowedRedirectUri('https://claude.ai/api/mcp/auth_callback'),
    ).toBe(true)
  })

  it('refuses plain http on a public host', () => {
    expect(isAllowedRedirectUri('http://example.com/cb')).toBe(false)
  })

  // RFC 8252: a native client redirects to a loopback port and cannot hold a
  // certificate for it. The traffic never leaves the machine.
  it.each(['http://127.0.0.1:7777/cb', 'http://[::1]:7777/cb'])(
    'accepts loopback over http (%s)',
    (uri) => {
      expect(isAllowedRedirectUri(uri)).toBe(true)
    },
  )

  // `localhost` resolves through DNS and can be pointed anywhere; the literal
  // loopback addresses cannot.
  it('refuses http://localhost, which is not the same thing', () => {
    expect(isAllowedRedirectUri('http://localhost:7777/cb')).toBe(false)
  })

  it('refuses a fragment, where a naive client would put a token', () => {
    expect(isAllowedRedirectUri('https://example.com/cb#x')).toBe(false)
  })

  it('refuses embedded credentials', () => {
    expect(isAllowedRedirectUri('https://user:pw@example.com/cb')).toBe(false)
  })

  it.each(['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd'])(
    'refuses the %s scheme',
    (uri) => {
      expect(isAllowedRedirectUri(uri)).toBe(false)
    },
  )

  it('refuses a wildcard host', () => {
    expect(isAllowedRedirectUri('https://*.example.com/cb')).toBe(false)
  })

  it('refuses something that is not a URL at all', () => {
    expect(isAllowedRedirectUri('not a url')).toBe(false)
  })
})

describe('redirectUriIsRegistered', () => {
  const registered = ['https://claude.ai/api/mcp/auth_callback']

  it('matches exactly', () => {
    expect(redirectUriIsRegistered(registered[0], registered)).toBe(true)
  })

  // Anything looser than exact equality is an open redirect: a prefix match
  // would accept the first, a suffix match the second.
  it.each([
    'https://claude.ai/api/mcp/auth_callback/../../evil',
    'https://claude.ai.evil.test/api/mcp/auth_callback',
    'https://claude.ai/api/mcp/auth_callback?x=1',
  ])('refuses the near-miss %s', (candidate) => {
    expect(redirectUriIsRegistered(candidate, registered)).toBe(false)
  })
})

describe('validateRegistration', () => {
  it('accepts a minimal registration', () => {
    const result = validateRegistration({
      client_name: 'Claude',
      redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
    })
    expect(result).toEqual({
      clientName: 'Claude',
      redirectUris: ['https://claude.ai/api/mcp/auth_callback'],
    })
  })

  it('names the client when it does not name itself', () => {
    const result = validateRegistration({
      redirect_uris: ['https://claude.ai/cb'],
    })
    expect(result).toMatchObject({ clientName: 'Unnamed MCP client' })
  })

  it('refuses a registration with no redirect URIs', () => {
    expect(validateRegistration({ redirect_uris: [] })).toMatchObject({
      error: 'invalid_redirect_uri',
    })
  })

  it('refuses a body that is not an object', () => {
    expect(validateRegistration('nope')).toMatchObject({
      error: 'invalid_client_metadata',
    })
  })

  it('refuses when any one URI is bad, not just when all are', () => {
    expect(
      validateRegistration({
        redirect_uris: ['https://claude.ai/cb', 'http://evil.test/cb'],
      }),
    ).toMatchObject({ error: 'invalid_redirect_uri' })
  })

  it('caps how many URIs one client may register', () => {
    expect(
      validateRegistration({
        redirect_uris: Array.from(
          { length: 6 },
          (_, i) => `https://claude.ai/cb${i}`,
        ),
      }),
    ).toMatchObject({ error: 'invalid_redirect_uri' })
  })

  it('refuses a grant type this server does not implement', () => {
    expect(
      validateRegistration({
        grant_types: ['client_credentials'],
        redirect_uris: ['https://claude.ai/cb'],
      }),
    ).toMatchObject({ error: 'invalid_client_metadata' })
  })

  it('truncates a client name rather than storing an essay', () => {
    const result = validateRegistration({
      client_name: 'x'.repeat(500),
      redirect_uris: ['https://claude.ai/cb'],
    })
    expect((result as { clientName: string }).clientName).toHaveLength(120)
  })

  // Display metadata is discarded rather than persisted: it would be rendered
  // to a person on the consent screen, and it is attacker-supplied.
  it('keeps nothing the client sends beyond name and URIs', () => {
    const result = validateRegistration({
      client_name: 'Claude',
      logo_uri: 'https://evil.test/logo.png',
      redirect_uris: ['https://claude.ai/cb'],
    })
    expect(Object.keys(result).sort()).toEqual(['clientName', 'redirectUris'])
  })
})
