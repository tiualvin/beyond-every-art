import { createHash, randomBytes } from 'node:crypto'

import { expect, test, type APIRequestContext } from '@playwright/test'

import { fixtures } from './fixtures'

// The OAuth authorization server, driven the way a connector drives it.
//
// The unit tests under `tests/oauth/` cover the pieces in isolation — PKCE,
// redirect URI rules, the sealed request, the capability grid. What none of
// them can show is that the eight steps compose: discovery, registration,
// login, consent, redirect, code exchange, an MCP call with the resulting
// token, and refresh. That sequence is the product, and every one of its joints
// is a place a client silently gives up.
//
// It runs against the loopback server, where `playwright.config.ts` sets
// `MCP_OAUTH_ENABLED=1` and a `CMS_ADDRESS` for the issuer to be derived from.

const ISSUER = 'http://127.0.0.1:3000'
const REDIRECT_URI = 'http://127.0.0.1:7777/callback'

/** A PKCE pair, generated the way a client is required to. */
function pkce() {
  const verifier = randomBytes(48).toString('base64url')
  return {
    challenge: createHash('sha256').update(verifier).digest('base64url'),
    verifier,
  }
}

async function registerClient(
  request: APIRequestContext,
  clientName = 'Playwright Connector',
): Promise<string> {
  const response = await request.post('/oauth/register', {
    data: { client_name: clientName, redirect_uris: [REDIRECT_URI] },
  })
  expect(response.status()).toBe(201)
  const body = await response.json()
  expect(body.token_endpoint_auth_method).toBe('none')
  return body.client_id as string
}

/** Signs in as the seeded editor, leaving the session cookie on the context. */
async function signIn(request: APIRequestContext): Promise<void> {
  const response = await request.post('/api/users/login', {
    data: {
      email: fixtures.mcp.editorEmail,
      password: fixtures.mcp.password,
    },
  })
  expect(response.status()).toBe(200)
}

/**
 * Headers a browser sends once it is on this origin.
 *
 * `Sec-Fetch-Site` is not decoration here. Payload refuses to read its session
 * cookie off a request that is cross-site or that carries no `Sec-Fetch-Site`
 * at all (`extractJWT`, when `csrf` is configured — and this deployment
 * configures it). A browser arriving from claude.ai sends `cross-site` on that
 * first navigation, is bounced to the admin login, and comes back `same-origin`
 * — which is what these requests stand in for. Omitting it here does not make
 * the test stricter; it makes it test a non-browser client that could never
 * complete this flow anyway.
 */
const BROWSER_HEADERS = { 'Sec-Fetch-Site': 'same-origin' }

/** Walks consent to a redirect, returning the authorization code. */
async function authorize(
  request: APIRequestContext,
  clientId: string,
  challenge: string,
  capabilities: string[] = ['tool.draftArticle'],
): Promise<string> {
  const url =
    `/oauth/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&code_challenge=${challenge}&code_challenge_method=S256&state=xyz`

  const page = await request.get(url, { headers: BROWSER_HEADERS })
  expect(page.status()).toBe(200)
  const html = await page.text()

  const sealed = /name="request" value="([^"]+)"/.exec(html)?.[1]
  expect(sealed, 'consent page carried no sealed request').toBeTruthy()

  const approved = await request.post('/oauth/authorize', {
    // A raw urlencoded body rather than Playwright's `form` helper, because
    // `capability` repeats — that is how a set of checkboxes arrives, and an
    // object cannot express one key twice.
    data: new URLSearchParams([
      ['decision', 'approve'],
      ['request', sealed!],
      ...capabilities.map((capability): [string, string] => [
        'capability',
        capability,
      ]),
    ]).toString(),
    headers: {
      ...BROWSER_HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    maxRedirects: 0,
  })
  expect(
    approved.status(),
    `consent POST returned ${approved.status()}: ${(await approved.text()).slice(0, 400)}`,
  ).toBe(302)

  const location = new URL(approved.headers()['location'])
  expect(location.searchParams.get('state')).toBe('xyz')
  const code = location.searchParams.get('code')
  expect(code).toBeTruthy()
  return code!
}

async function exchange(
  request: APIRequestContext,
  code: string,
  verifier: string,
) {
  const response = await request.post('/oauth/token', {
    form: {
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
    },
  })
  return { body: await response.json(), status: response.status() }
}

const mcpHeaders = (token: string) => ({
  Accept: 'application/json, text/event-stream',
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
})

test.describe('OAuth authorization server', () => {
  // Serial, with a single sign-in shared by every test that needs one.
  //
  // Not a style choice. Payload records a session id on the user document at
  // login and validates the `sid` in the JWT against it, so several tests
  // signing in as the same seeded editor at once race on that array — one
  // login's write drops another's session, and the loser's next request is
  // suddenly unauthenticated. The symptom is a consent POST answering 401
  // halfway through a flow whose GET worked moments earlier.
  //
  // One login also keeps the suite well clear of the login rate limit, which
  // is per source address and which the whole suite shares.
  test.describe.configure({ mode: 'serial' })

  let session: APIRequestContext

  test.beforeAll(async ({ playwright }) => {
    session = await playwright.request.newContext({
      baseURL: 'http://127.0.0.1:3000',
    })
    await signIn(session)
  })

  test.afterAll(async () => {
    await session.dispose()
  })

  test('advertises itself from the MCP endpoint 401', async ({ request }) => {
    const response = await request.post('/api/mcp', {
      headers: {
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
      },
      data: { id: 1, jsonrpc: '2.0', method: 'tools/list' },
    })

    expect(response.status()).toBe(401)

    // The single most load-bearing header here. Without it a client sees a bare
    // 401, concludes it is simply refused, and never discovers the flow exists.
    const challenge = response.headers()['www-authenticate']
    expect(challenge).toContain('Bearer')
    expect(challenge).toContain(
      `resource_metadata="${ISSUER}/.well-known/oauth-protected-resource/api/mcp"`,
    )
  })

  test('serves both discovery documents, at both paths clients ask for', async ({
    request,
  }) => {
    // RFC 9728 inserts the resource path after the well-known prefix; plenty of
    // clients ask for the bare form instead. Both have to answer.
    for (const path of [
      '/.well-known/oauth-protected-resource',
      '/.well-known/oauth-protected-resource/api/mcp',
    ]) {
      const response = await request.get(path)
      expect(response.status(), path).toBe(200)
      const body = await response.json()
      expect(body.resource).toBe(`${ISSUER}/api/mcp`)
      expect(body.authorization_servers).toEqual([ISSUER])
    }

    const server = await request.get('/.well-known/oauth-authorization-server')
    expect(server.status()).toBe(200)
    const metadata = await server.json()
    expect(metadata.issuer).toBe(ISSUER)
    expect(metadata.registration_endpoint).toBe(`${ISSUER}/oauth/register`)
    expect(metadata.code_challenge_methods_supported).toEqual(['S256'])
  })

  test('registers a client, and refuses an unsafe redirect', async ({
    request,
  }) => {
    await registerClient(request)

    const bad = await request.post('/oauth/register', {
      data: { redirect_uris: ['http://evil.test/cb'] },
    })
    expect(bad.status()).toBe(400)
    expect((await bad.json()).error).toBe('invalid_redirect_uri')
  })

  test('sends an unauthenticated approver to log in first', async ({
    request,
  }) => {
    const clientId = await registerClient(request)
    const { challenge } = pkce()

    const response = await request.get(
      `/oauth/authorize?response_type=code&client_id=${clientId}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&code_challenge=${challenge}&code_challenge_method=S256`,
      { maxRedirects: 0 },
    )

    expect(response.status()).toBe(302)
    const location = response.headers()['location']
    expect(location).toContain('/admin/login')
    // The whole authorization request is carried into the login redirect, so
    // signing in returns the person to consent rather than to an empty panel.
    expect(location).toContain('redirect=')
    expect(decodeURIComponent(location)).toContain('code_challenge')
  })

  // The case every real connector hits first. A browser following claude.ai's
  // redirect sends `Sec-Fetch-Site: cross-site`, Payload declines to read its
  // session cookie on such a request, and this endpoint therefore bounces even
  // an already-signed-in administrator to the login form. That is worth having:
  // a standing grant of authority should be preceded by a fresh authentication,
  // not by whatever session happened to be open in another tab.
  test('bounces a cross-site arrival to login even with a live session', async () => {
    const request = session

    const clientId = await registerClient(request)
    const { challenge } = pkce()

    const response = await request.get(
      `/oauth/authorize?response_type=code&client_id=${clientId}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&code_challenge=${challenge}&code_challenge_method=S256`,
      { headers: { 'Sec-Fetch-Site': 'cross-site' }, maxRedirects: 0 },
    )

    expect(response.status()).toBe(302)
    expect(response.headers()['location']).toContain('/admin/login')
  })

  // An unvalidated redirect URI must never be redirected to, even to report an
  // error: that is what turns an authorization server into an open redirect.
  test('answers an unregistered redirect with a page, never a redirect', async ({
    request,
  }) => {
    const clientId = await registerClient(request)
    const { challenge } = pkce()

    const response = await request.get(
      `/oauth/authorize?response_type=code&client_id=${clientId}` +
        `&redirect_uri=${encodeURIComponent('https://evil.test/steal')}` +
        `&code_challenge=${challenge}&code_challenge_method=S256`,
      { maxRedirects: 0 },
    )

    expect(response.status()).toBe(400)
    expect(response.headers()['location']).toBeUndefined()
    expect(await response.text()).toContain('Nothing has been authorized')
  })

  test('refuses a request that brings no PKCE challenge', async ({
    request,
  }) => {
    const clientId = await registerClient(request)

    const response = await request.get(
      `/oauth/authorize?response_type=code&client_id=${clientId}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`,
      { maxRedirects: 0 },
    )

    // Registered URI, so the error goes back to the client rather than to a page.
    expect(response.status()).toBe(302)
    expect(response.headers()['location']).toContain('error=invalid_request')
  })

  test('completes the whole flow and returns a working MCP token', async () => {
    const request = session

    const clientId = await registerClient(request)
    const { challenge, verifier } = pkce()

    const code = await authorize(request, clientId, challenge)
    const { body, status } = await exchange(request, code, verifier)

    expect(status).toBe(200)
    expect(body.token_type).toBe('Bearer')
    expect(body.access_token).toMatch(/^bea_at_/)
    expect(body.refresh_token).toMatch(/^bea_rt_/)

    // The point of all of it: the token authenticates an MCP call.
    const tools = await request.post('/api/mcp', {
      headers: mcpHeaders(body.access_token),
      data: { id: 1, jsonrpc: '2.0', method: 'tools/list' },
    })
    expect(tools.status()).toBe(200)

    const listed = /data:\s*(\{.*)/.exec(await tools.text())?.[1]
    const names = (
      JSON.parse(listed!).result?.tools as Array<{ name: string }>
    ).map((tool) => tool.name)

    // Only what the consent form ticked. `tool.draftArticle` was the sole
    // capability approved, so the drafting tool is present and the others,
    // whose checkboxes the plugin defaults to *on*, are not.
    expect(names).toContain('draftArticle')
    expect(names).not.toContain('uploadMedia')
  })

  test('refuses to publish, whatever the grant may otherwise do', async () => {
    const request = session

    const clientId = await registerClient(request)
    const { challenge, verifier } = pkce()
    // `posts.update` is granted on purpose. Without it the tool would simply be
    // absent and this test would pass for the wrong reason — proving the
    // capability grid works, not the publish guard. With it, `updatePosts` is
    // available to the grant and the refusal has to come from the guard.
    const code = await authorize(request, clientId, challenge, [
      'posts.update',
      'posts.find',
    ])
    const { body } = await exchange(request, code, verifier)

    const attempt = await request.post('/api/mcp', {
      headers: mcpHeaders(body.access_token),
      data: {
        id: 1,
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          arguments: {
            _status: 'published',
            where: JSON.stringify({
              slug: { equals: fixtures.draftPost.slug },
            }),
          },
          name: 'updatePosts',
        },
      },
    })

    const text = await attempt.text()
    expect(text).toContain(
      'Publishing through an OAuth connector is not permitted',
    )
    expect(text).toContain('Updated: 0 documents')
  })

  test('rotates refresh tokens and revokes the grant on replay', async () => {
    const request = session

    const clientId = await registerClient(request)
    const { challenge, verifier } = pkce()
    const code = await authorize(request, clientId, challenge)
    const first = (await exchange(request, code, verifier)).body

    const refreshed = await request.post('/oauth/token', {
      form: { grant_type: 'refresh_token', refresh_token: first.refresh_token },
    })
    expect(refreshed.status()).toBe(200)
    const second = await refreshed.json()
    expect(second.refresh_token).not.toBe(first.refresh_token)

    // The old one is spent. A caller presenting it is either a thief or a
    // client that lost the rotation — and the two cannot be told apart, so the
    // grant is burned rather than merely refused.
    const replay = await request.post('/oauth/token', {
      form: { grant_type: 'refresh_token', refresh_token: first.refresh_token },
    })
    expect(replay.status()).toBe(400)
    expect((await replay.json()).error).toBe('invalid_grant')
  })

  test('a redeemed authorization code cannot be redeemed twice', async () => {
    const request = session

    const clientId = await registerClient(request)
    const { challenge, verifier } = pkce()
    const code = await authorize(request, clientId, challenge)

    expect((await exchange(request, code, verifier)).status).toBe(200)

    const replay = await exchange(request, code, verifier)
    expect(replay.status).toBe(400)
    expect(replay.body.error).toBe('invalid_grant')
  })

  test('refuses the exchange when PKCE does not match', async () => {
    const request = session

    const clientId = await registerClient(request)
    const { challenge } = pkce()
    const code = await authorize(request, clientId, challenge)

    // A stolen code, redeemed by someone who never had the verifier.
    const stolen = await exchange(request, code, pkce().verifier)
    expect(stolen.status).toBe(400)
    expect(stolen.body.error).toBe('invalid_grant')
  })

  test('revocation stops a live access token', async () => {
    const request = session

    const clientId = await registerClient(request)
    const { challenge, verifier } = pkce()
    const code = await authorize(request, clientId, challenge)
    const { body } = await exchange(request, code, verifier)

    const before = await request.post('/api/mcp', {
      headers: mcpHeaders(body.access_token),
      data: { id: 1, jsonrpc: '2.0', method: 'tools/list' },
    })
    expect(before.status()).toBe(200)

    const revoked = await request.post('/oauth/revoke', {
      form: { token: body.access_token },
    })
    expect(revoked.status()).toBe(200)

    const after = await request.post('/api/mcp', {
      headers: mcpHeaders(body.access_token),
      data: { id: 1, jsonrpc: '2.0', method: 'tools/list' },
    })
    expect(after.status()).toBe(401)
  })
})
