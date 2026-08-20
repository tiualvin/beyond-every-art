import { describe, expect, it } from 'vitest'

import {
  authorizationServerMetadata,
  protectedResourceMetadata,
  wwwAuthenticate,
} from '../../lib/oauth/metadata'

const ORIGIN = 'https://cms.beyondeveryart.com'

describe('protectedResourceMetadata', () => {
  it('names the MCP endpoint as the resource', () => {
    expect(protectedResourceMetadata(ORIGIN).resource).toBe(`${ORIGIN}/api/mcp`)
  })

  it('points at this deployment as its own authorization server', () => {
    expect(protectedResourceMetadata(ORIGIN).authorization_servers).toEqual([
      ORIGIN,
    ])
  })
})

describe('authorizationServerMetadata', () => {
  const metadata = authorizationServerMetadata(ORIGIN)

  it('advertises the endpoints that exist', () => {
    expect(metadata.authorization_endpoint).toBe(`${ORIGIN}/oauth/authorize`)
    expect(metadata.token_endpoint).toBe(`${ORIGIN}/oauth/token`)
    expect(metadata.registration_endpoint).toBe(`${ORIGIN}/oauth/register`)
  })

  // Each of these absences is a decision. Advertising them would invite a
  // client to try a flow this server does not implement, or a weaker one.
  it('offers only S256, so a client cannot negotiate plain PKCE', () => {
    expect(metadata.code_challenge_methods_supported).toEqual(['S256'])
  })

  it('offers only the two grants that are implemented', () => {
    expect(metadata.grant_types_supported.sort()).toEqual([
      'authorization_code',
      'refresh_token',
    ])
  })

  it('offers no implicit flow, which OAuth 2.1 removed', () => {
    expect(metadata.response_types_supported).toEqual(['code'])
  })

  it('declares public clients, because none of them can keep a secret', () => {
    expect(metadata.token_endpoint_auth_methods_supported).toEqual(['none'])
  })

  it('declares resource indicator support, which the token endpoint enforces', () => {
    expect(metadata.resource_indicators_supported).toBe(true)
  })
})

describe('wwwAuthenticate', () => {
  // Without this header a client sees a bare 401, concludes it is simply
  // refused, and never discovers that an authorization server exists.
  it('names the resource metadata document', () => {
    expect(wwwAuthenticate(ORIGIN)).toContain(
      `resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/api/mcp"`,
    )
  })

  it('is a Bearer challenge', () => {
    expect(wwwAuthenticate(ORIGIN).startsWith('Bearer ')).toBe(true)
  })
})
