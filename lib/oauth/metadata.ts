// The two documents a client reads before it knows how to authenticate.
//
// An MCP client is handed one thing: the endpoint URL. Everything else — that
// authorization is required at all, which authorization server issues it, where
// to register, where to send the user — it discovers, in this order:
//
//   1. it calls `POST /api/mcp` with no credential and gets a 401 whose
//      `WWW-Authenticate` header names a resource metadata URL (RFC 9728);
//   2. it fetches that URL and learns which authorization server to trust;
//   3. it fetches that server's metadata (RFC 8414) and learns the endpoints.
//
// Here the resource and the authorization server are the same deployment, so
// both documents describe this origin. They are kept separate anyway, because
// they answer different questions and clients fetch them independently — and
// because a future that moves issuance elsewhere only has to change the
// `authorization_servers` line rather than the shape of anything.
//
// See `docs/MCP_OAUTH.md`.

import { CODE_CHALLENGE_METHOD } from './pkce'

/** Where the MCP endpoint lives, relative to the CMS origin. */
export const MCP_PATH = '/api/mcp'

/** RFC 9728 §3: the resource metadata document, discovered from the 401. */
export function protectedResourceMetadata(origin: string) {
  return {
    resource: `${origin}${MCP_PATH}`,
    authorization_servers: [origin],
    bearer_methods_supported: ['header'],
    resource_documentation: `${origin}/oauth/docs`,
    scopes_supported: ['mcp'],
  }
}

/**
 * RFC 8414 §2: the authorization server metadata document.
 *
 * What is deliberately absent is as informative as what is present. There is no
 * `token_endpoint_auth_methods_supported` entry for anything but `none`,
 * because every client here is a public client using PKCE — an MCP client runs
 * in somebody else's cloud and cannot keep a secret, so issuing one would be a
 * secret in name only. There is no implicit or password grant, both removed by
 * OAuth 2.1. And `code_challenge_methods_supported` lists only S256, which is
 * how a client learns it may not fall back to `plain`.
 */
export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    revocation_endpoint: `${origin}/oauth/revoke`,
    scopes_supported: ['mcp'],
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: [CODE_CHALLENGE_METHOD],
    revocation_endpoint_auth_methods_supported: ['none'],
    // RFC 8707. The client is expected to name which resource it wants a token
    // for, and the token endpoint refuses a value that is not the MCP endpoint
    // — so a token minted here cannot be replayed against some other service
    // that happens to trust this issuer.
    resource_indicators_supported: true,
    service_documentation: `${origin}/oauth/docs`,
  }
}

/**
 * The `WWW-Authenticate` value that starts the whole flow.
 *
 * Without this header a client receiving a 401 has no way to tell an
 * unauthenticated MCP server from a broken one, and no way to find the
 * authorization server. It is the single most load-bearing string in this
 * module: omit it and every well-behaved client gives up rather than
 * registering.
 */
export function wwwAuthenticate(origin: string): string {
  return [
    'Bearer',
    `resource_metadata="${origin}/.well-known/oauth-protected-resource${MCP_PATH}"`,
    'error="invalid_token"',
    'error_description="Authorization required to call the MCP endpoint."',
  ].join(' ')
}
