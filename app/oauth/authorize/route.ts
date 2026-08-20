import { NextResponse } from 'next/server'

import {
  capabilityDocument,
  collectionCapabilities,
  toolCapabilities,
} from '@/lib/oauth/capabilities'
import { redirectUriIsRegistered } from '@/lib/oauth/clients'
import { issuerOrigin, oauthEnabled } from '@/lib/oauth/config'
import { renderConsentPage, renderErrorPage } from '@/lib/oauth/consent-page'
import { createGrant } from '@/lib/oauth/grants'
import { CODE_CHALLENGE_METHOD } from '@/lib/oauth/pkce'
import {
  SEAL_TTL_MS,
  openRequest,
  sealRequest,
  type AuthorizeRequest,
} from '@/lib/oauth/authorize-request'
import { MCP_PATH } from '@/lib/oauth/metadata'
import { getPayloadClient } from '@/lib/payload'

// The authorization endpoint: the only place a human is in the loop.
//
// `GET` validates the request and renders the consent screen. `POST` is the
// approval, and reads nothing from the form except the decision, the ticked
// capabilities, and the sealed request the `GET` produced — see
// `lib/oauth/authorize-request.ts` for why the OAuth parameters are not read
// from form fields.
//
// The order of checks in `GET` is deliberate and is the rule OAuth 2.1 states
// plainly: a request whose `client_id` or `redirect_uri` cannot be validated is
// answered with a page, never a redirect. Redirecting an error to an
// unvalidated URI is how an authorization server becomes an open redirect.
export const dynamic = 'force-dynamic'

const html = (body: string, status = 200) =>
  new NextResponse(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })

/** Sends the client its error through the redirect, as RFC 6749 §4.1.2.1 asks. */
function redirectError(
  redirectUri: string,
  error: string,
  description: string,
  state?: string,
): NextResponse {
  const url = new URL(redirectUri)
  url.searchParams.set('error', error)
  url.searchParams.set('error_description', description)
  if (state) url.searchParams.set('state', state)
  return NextResponse.redirect(url.toString(), 302)
}

export async function GET(request: Request): Promise<NextResponse> {
  const origin = issuerOrigin()
  if (!oauthEnabled() || !origin) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 })
  }

  const params = new URL(request.url).searchParams
  const clientId = params.get('client_id') ?? ''
  const redirectUri = params.get('redirect_uri') ?? ''
  const state = params.get('state') ?? undefined

  const payload = await getPayloadClient()

  const { docs } = await payload.find({
    collection: 'oauth-clients',
    where: { clientId: { equals: clientId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    pagination: false,
  })

  const client = docs[0] as unknown as
    | { clientName?: unknown; id: number | string; redirectUris?: unknown }
    | undefined

  if (!client) {
    return html(
      renderErrorPage(
        'Unknown application',
        'No application is registered under that client id. Remove the connector and add it again.',
      ),
      400,
    )
  }

  const registered = Array.isArray(client.redirectUris)
    ? (client.redirectUris as string[])
    : []

  if (!redirectUri || !redirectUriIsRegistered(redirectUri, registered)) {
    return html(
      renderErrorPage(
        'Redirect address not registered',
        'This application asked to be sent somewhere it did not register. Nothing has been authorized.',
      ),
      400,
    )
  }

  // From here the redirect URI is trusted, so protocol errors go back to the
  // client rather than to a dead-end page — that is what lets a connector show
  // the user a useful message instead of hanging.
  if (params.get('response_type') !== 'code') {
    return redirectError(
      redirectUri,
      'unsupported_response_type',
      'Only the authorization code flow is supported.',
      state,
    )
  }

  const codeChallenge = params.get('code_challenge') ?? ''
  if (!codeChallenge) {
    return redirectError(
      redirectUri,
      'invalid_request',
      'PKCE is required: send code_challenge with code_challenge_method=S256.',
      state,
    )
  }

  if ((params.get('code_challenge_method') ?? '') !== CODE_CHALLENGE_METHOD) {
    return redirectError(
      redirectUri,
      'invalid_request',
      'code_challenge_method must be S256.',
      state,
    )
  }

  // RFC 8707. A client naming a resource this server does not serve is asking
  // for a token to use somewhere else, and must not be given one.
  const resource = params.get('resource') ?? undefined
  if (resource && new URL(resource).href !== `${origin}${MCP_PATH}`) {
    return redirectError(
      redirectUri,
      'invalid_target',
      `This server only issues tokens for ${origin}${MCP_PATH}.`,
      state,
    )
  }

  // Who is approving. Payload's session cookie is set on this origin by the
  // admin panel, so an editor who is already signed in sees the consent screen
  // directly; anyone else is sent to log in and returned here.
  const { user } = await payload.auth({ headers: request.headers })
  if (!user) {
    const back = new URL(request.url)
    const login = new URL('/admin/login', origin)
    login.searchParams.set('redirect', `${back.pathname}${back.search}`)
    return NextResponse.redirect(login.toString(), 302)
  }

  const sealed = sealRequest(
    {
      clientId,
      clientName: String(client.clientName ?? 'Unnamed MCP client'),
      codeChallenge,
      expiresAt: Date.now() + SEAL_TTL_MS,
      redirectUri,
      resource,
      state,
    },
    payload.secret,
  )

  // Ticked by default: the drafting set. Everything an agent needs to write and
  // revise an article, and nothing else — `delete` is not offered by the plugin
  // at all, and publishing is refused for OAuth grants regardless.
  const defaults = new Set<string>([
    ...collectionCapabilities().flatMap((row) =>
      row.operations.map((operation) => `${row.group}.${operation}`),
    ),
    ...toolCapabilities().map((name) => `tool.${name}`),
  ])

  return html(
    renderConsentPage({
      clientName: String(client.clientName ?? 'Unnamed MCP client'),
      collections: collectionCapabilities(),
      defaults,
      sealed,
      tools: toolCapabilities(),
      userLabel: String(
        (user as { email?: unknown }).email ?? (user as { id: unknown }).id,
      ),
    }),
  )
}

export async function POST(request: Request): Promise<NextResponse> {
  const origin = issuerOrigin()
  if (!oauthEnabled() || !origin) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 })
  }

  const payload = await getPayloadClient()
  const form = await request.formData()

  const sealed = String(form.get('request') ?? '')
  const approval: AuthorizeRequest | null = openRequest(sealed, payload.secret)
  if (!approval) {
    return html(
      renderErrorPage(
        'This approval has expired',
        'The consent page was left open too long, or the request was altered. Start the connection again.',
      ),
      400,
    )
  }

  // Re-checked, not assumed. The seal proves the request was validated when it
  // was issued; this proves the person pressing Approve is still signed in, and
  // is who the grant will be written against.
  const { user } = await payload.auth({ headers: request.headers })
  if (!user) {
    return html(
      renderErrorPage(
        'You are no longer signed in',
        'Sign in to the admin panel and start the connection again.',
      ),
      401,
    )
  }

  if (String(form.get('decision') ?? '') !== 'approve') {
    return redirectError(
      approval.redirectUri,
      'access_denied',
      'The request was denied.',
      approval.state,
    )
  }

  const granted = new Set(
    form.getAll('capability').map((value) => String(value)),
  )

  const { docs } = await payload.find({
    collection: 'oauth-clients',
    where: { clientId: { equals: approval.clientId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    pagination: false,
  })
  const client = docs[0] as unknown as { id: number | string } | undefined
  if (!client) {
    return html(
      renderErrorPage(
        'Unknown application',
        'The application was removed while this page was open.',
      ),
      400,
    )
  }

  // The capability record. It is a `payload-mcp-api-keys` document with no
  // bearer key attached — `enableAPIKey` is left off — so it is reachable only
  // through this grant's tokens, while still being the same record type the
  // plugin already enforces, the audit log already names, and an administrator
  // already knows how to revoke.
  const apiKey = await payload.create({
    collection: 'payload-mcp-api-keys',
    data: {
      ...capabilityDocument(granted),
      description: `Authorized ${new Date().toISOString()} through OAuth. No bearer key; reachable only through its OAuth grant.`,
      label: `${approval.clientName} (OAuth)`,
      user: user.id,
    },
    overrideAccess: true,
  } as unknown as Parameters<typeof payload.create>[0])

  const code = await createGrant(payload, {
    apiKeyId: apiKey.id,
    clientId: client.id,
    clientName: approval.clientName,
    codeChallenge: approval.codeChallenge,
    redirectUri: approval.redirectUri,
    userId: user.id,
    userLabel: String((user as { email?: unknown }).email ?? user.id),
  })

  const target = new URL(approval.redirectUri)
  target.searchParams.set('code', code)
  if (approval.state) target.searchParams.set('state', approval.state)
  return NextResponse.redirect(target.toString(), 302)
}
