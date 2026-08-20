import config from '@payload-config'
import {
  REST_DELETE,
  REST_GET,
  REST_OPTIONS,
  REST_PATCH,
  REST_POST,
  REST_PUT,
} from '@payloadcms/next/routes'

import { issuerOrigin, oauthEnabled } from '@/lib/oauth/config'
import { MCP_PATH, wwwAuthenticate } from '@/lib/oauth/metadata'

const payloadPost = REST_POST(config)

/**
 * Adds the `WWW-Authenticate` challenge to an unauthenticated MCP request.
 *
 * This wrapper exists because Payload builds its error responses itself:
 * `routeError` constructs the `Response` from the thrown error, and an error
 * cannot carry headers, so there is no hook inside the plugin or the endpoint
 * that can attach one. The header has to go on afterwards.
 *
 * It is not a nicety. A client handed only an endpoint URL discovers everything
 * else from the 401: RFC 9728 says the challenge names the resource metadata
 * document, and that document names the authorization server. Without the
 * header a well-behaved client sees a bare 401, concludes the server is simply
 * refusing it, and never registers — which is precisely how this endpoint
 * behaved before the OAuth layer existed.
 *
 * Only when OAuth is switched on. Advertising a discovery document that would
 * 404 sends clients down a path that dead-ends, which is worse than the plain
 * 401 they get from an endpoint that only takes API keys.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string[] }> },
): Promise<Response> {
  const response = await payloadPost(
    request as Parameters<typeof payloadPost>[0],
    context as Parameters<typeof payloadPost>[1],
  )

  if (response.status !== 401) return response

  const origin = issuerOrigin()
  if (!oauthEnabled() || !origin) return response
  if (new URL(request.url).pathname !== MCP_PATH) return response

  const headers = new Headers(response.headers)
  headers.set('WWW-Authenticate', wwwAuthenticate(origin))
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export const GET = REST_GET(config)
export const DELETE = REST_DELETE(config)
export const PATCH = REST_PATCH(config)
export const PUT = REST_PUT(config)
export const OPTIONS = REST_OPTIONS(config)
