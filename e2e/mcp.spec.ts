import { expect, test, type APIRequestContext } from '@playwright/test'

import { fixtures } from './fixtures'

// The MCP endpoint, over the wire.
//
// Everything else about MCP is unit-tested — the limiter, the markdown round
// trip, the publish guard's predicate, the upload decoder, the response
// elision. What none of that can show is whether the endpoint is mounted, whether
// a bearer key resolves to the right Payload user, which tools a key is actually
// offered, and whether the guards hold when a real HTTP request goes through the
// whole stack. Until this file existed that was verified by hand once, before a
// merge, and nothing would have caught a regression from the next `3.x` bump.
//
// The endpoint exists here because `playwright.config.ts` sets `MCP_ENABLED=1`
// for the test server, and the keys exist because `e2e/seed.ts` creates them.

const ENDPOINT = '/api/mcp'

/**
 * Streamable HTTP, as the transport requires it.
 *
 * `Accept` must list both types or the MCP SDK answers 406 before it looks at
 * the body — a detail worth encoding once here rather than rediscovering per
 * test. The server is stateless (SSE is disabled, so no session id is minted),
 * which is why every call below stands alone and none carries `Mcp-Session-Id`.
 */
const headers = (key?: string): Record<string, string> => ({
  Accept: 'application/json, text/event-stream',
  'Content-Type': 'application/json',
  ...(key ? { Authorization: `Bearer ${key}` } : {}),
})

let nextId = 0

/**
 * Reads a JSON-RPC result out of the response.
 *
 * Responses come back SSE-framed rather than as bare JSON: the SDK only returns
 * `application/json` when `enableJsonResponse` is set, and the plugin does not
 * set it. So the payload arrives as `event: message` / `data: {...}` lines.
 */
function parseRpc(body: string): Record<string, unknown> {
  const line = body
    .split('\n')
    .find((candidate) => candidate.startsWith('data:'))
  expect(line, `no SSE data frame in response: ${body}`).toBeTruthy()
  return JSON.parse(line!.slice('data:'.length).trim())
}

async function rpc(
  request: APIRequestContext,
  key: string,
  method: string,
  params?: Record<string, unknown>,
) {
  const response = await request.post(ENDPOINT, {
    headers: headers(key),
    data: { id: (nextId += 1), jsonrpc: '2.0', method, params },
  })
  expect(response.status()).toBe(200)
  return parseRpc(await response.text())
}

/**
 * Calls a tool that is expected to succeed and returns its parsed JSON reply.
 *
 * The custom tools answer with one text block holding JSON, so a failure here
 * names the tool's own error rather than a parse error three lines later.
 */
async function callToolJson(
  request: APIRequestContext,
  key: string,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const message = await rpc(request, key, 'tools/call', {
    arguments: args,
    name,
  })
  const result = message.result as
    { content?: Array<{ text?: string }>; isError?: boolean } | undefined
  expect(result?.isError, JSON.stringify(message)).toBeFalsy()
  return JSON.parse(result!.content![0].text!)
}

/** Calls a tool and returns its text content, whether it succeeded or not. */
async function callTool(
  request: APIRequestContext,
  key: string,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const message = await rpc(request, key, 'tools/call', {
    arguments: args,
    name,
  })
  return JSON.stringify(message)
}

test.describe('MCP endpoint', () => {
  // The refusals, first. Each one runs before the MCP handler is entered, so
  // they are the paths Payload's `routeError` shapes rather than the SDK.
  test('refuses GET with 405 and says so in the body', async ({ request }) => {
    const response = await request.get(ENDPOINT, { headers: headers() })

    // 405 is what the transport spec asks a server with no SSE stream to
    // answer, and the plugin on its own returns a JSON-RPC error inside a 200.
    expect(response.status()).toBe(405)

    // This is also the end-to-end proof for the refusal shape generally.
    // `routeError` reads `status` off the thrown error and replaces the message
    // with "Something went wrong." unless the error is marked public — so a
    // plain `Error` here would surface as 500 with no usable text, which is
    // exactly what the rate-limit refusals used to do. See `lib/mcp/errors.ts`.
    const body = await response.text()
    expect(body).toContain('POST')
    expect(body).not.toContain('Something went wrong')
  })

  test('refuses a request with no credential', async ({ request }) => {
    const response = await request.post(ENDPOINT, {
      headers: headers(),
      data: { id: 1, jsonrpc: '2.0', method: 'tools/list' },
    })
    expect(response.status()).toBe(401)
  })

  test('refuses an unrecognised key', async ({ request }) => {
    const response = await request.post(ENDPOINT, {
      headers: headers('not-a-real-key-000000000000000000'),
      data: { id: 1, jsonrpc: '2.0', method: 'tools/list' },
    })
    expect(response.status()).toBe(401)
  })

  test('completes the initialize handshake for a valid key', async ({
    request,
  }) => {
    const message = await rpc(request, fixtures.mcp.editorKey, 'initialize', {
      capabilities: {},
      clientInfo: { name: 'playwright', version: '0' },
      protocolVersion: '2025-06-18',
    })

    expect(message.error).toBeUndefined()
    expect(message.result).toMatchObject({ serverInfo: expect.anything() })
  })

  test('offers the drafting tools and nothing outside the allowlist', async ({
    request,
  }) => {
    const message = await rpc(request, fixtures.mcp.editorKey, 'tools/list')
    const tools = (
      (message.result as { tools?: Array<{ name: string }> })?.tools ?? []
    ).map((tool) => tool.name)

    expect(tools).toEqual(
      expect.arrayContaining([
        'draftArticle',
        'readArticleMarkdown',
        'listArticleVersions',
        'readArticleVersion',
        'updateArticleMarkdown',
        'uploadMedia',
        'findPosts',
      ]),
    )

    // Restoring a version overwrites the whole document, and nothing should
    // offer that until it is decided separately. See `lib/mcp/tools.ts`.
    expect(tools.filter((name) => /restore/i.test(name))).toEqual([])

    // The allowlist is the whole security story for reach, so assert the
    // absence rather than trusting the config to have been read correctly.
    // These collections hold personal, billing, and credential data and are
    // permanently out of scope — a tool for any of them means the allowlist
    // grew without anyone deciding it should.
    for (const forbidden of fixtures.mcp.forbiddenCollections) {
      const capitalised = forbidden.charAt(0).toUpperCase() + forbidden.slice(1)
      expect(tools).not.toContain(`find${capitalised}`)
      expect(tools).not.toContain(`create${capitalised}`)
      expect(tools).not.toContain(`update${capitalised}`)
    }

    // `delete: false` on posts, because an agent that removes an article is not
    // a workflow this project wants.
    expect(tools).not.toContain('deletePosts')
  })

  test('drafts an article from Markdown and reads it back', async ({
    request,
  }) => {
    // Unique per run, because the slug is unique in the database and CI retries
    // the whole spec rather than rolling anything back.
    const slug = `e2e-mcp-draft-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const body =
      '## Ground layers\n\nA short body with *emphasis* and a list:\n\n- one\n- two\n'

    const created = await callTool(
      request,
      fixtures.mcp.editorKey,
      'draftArticle',
      {
        markdown: body,
        slug,
        title: 'E2E MCP Drafted Article',
      },
    )

    expect(created).toContain(slug)
    expect(created).toContain('draft')

    const read = await callTool(
      request,
      fixtures.mcp.editorKey,
      'readArticleMarkdown',
      { slug },
    )

    // The round trip through Lexical has to keep the structure, not just the
    // words: a body that saves cleanly and renders empty is the failure mode
    // the markdown tools exist to avoid.
    expect(read).toContain('Ground layers')
    expect(read).toContain('emphasis')
  })

  // Version history, over the wire: a real Lexical round trip against a real
  // versions table, which is the part a unit test with a stub cannot show.
  test("lists an article's versions and reads an old one without changing the draft", async ({
    request,
  }) => {
    const key = fixtures.mcp.editorKey
    const slug = `e2e-mcp-versions-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const first =
      '## Ground layers\n\nThe first draft talks about *chalk* grounds.\n'
    const second =
      '## Ground layers\n\nThe revision talks about *lead white* instead.\n'

    await callToolJson(request, key, 'draftArticle', {
      markdown: first,
      slug,
      title: 'E2E MCP Versioned Article',
    })
    await callToolJson(request, key, 'updateArticleMarkdown', {
      markdown: second,
      slug,
    })

    const listed = await callToolJson(request, key, 'listArticleVersions', {
      slug,
    })
    const versions = listed.versions as Array<{
      latest: boolean
      snippet: string
      versionId: string
    }>

    // Newest first, bodies summarised rather than returned.
    expect(versions.length).toBeGreaterThanOrEqual(2)
    expect(versions[0].latest).toBe(true)
    expect(versions[0].snippet).toContain('lead white')
    expect(JSON.stringify(listed)).not.toContain('"markdown"')

    const older = versions.find((version) => version.snippet.includes('chalk'))
    expect(older, JSON.stringify(versions)).toBeDefined()

    const old = await callToolJson(request, key, 'readArticleVersion', {
      versionId: older!.versionId,
    })
    expect(old.markdown).toContain('chalk')
    expect(old.markdown).not.toContain('lead white')
    expect(old).toMatchObject({
      slug,
      status: 'draft',
      versionId: older!.versionId,
    })

    // The same conversion as the live read: the newest version and the draft
    // must come back byte for byte identical, or a comparison between them
    // would show differences that are not in the article.
    const latest = await callToolJson(request, key, 'readArticleVersion', {
      versionId: versions[0].versionId,
    })
    const current = await callToolJson(request, key, 'readArticleMarkdown', {
      slug,
    })
    expect(latest.markdown).toBe(current.markdown)

    // And reading history wrote nothing: the draft is still the revision.
    expect(current.markdown).toContain('lead white')
    const after = await callToolJson(request, key, 'listArticleVersions', {
      slug,
    })
    expect(after.totalVersions).toBe(listed.totalVersions)
  })

  // An author may read their own drafts and published articles, and not a
  // colleague's draft — `postsRead` says so for the document, and the rule on
  // its versions has to say the same, or history becomes the way around it.
  test("keeps an author key out of a colleague's draft history", async ({
    request,
  }) => {
    const slug = `e2e-mcp-versions-private-${Date.now()}-${Math.floor(Math.random() * 1e6)}`

    await callToolJson(request, fixtures.mcp.editorKey, 'draftArticle', {
      markdown: 'An editor draft no author should read, now or in history.',
      slug,
      title: 'E2E MCP Private Draft',
    })
    const listed = await callToolJson(
      request,
      fixtures.mcp.editorKey,
      'listArticleVersions',
      { slug },
    )
    const [{ versionId }] = listed.versions as Array<{ versionId: string }>

    const byList = await callTool(
      request,
      fixtures.mcp.authorKey,
      'listArticleVersions',
      { slug },
    )
    expect(byList).toContain('"isError":true')
    expect(byList).not.toContain('no author should read')

    const byId = await callTool(
      request,
      fixtures.mcp.authorKey,
      'readArticleVersion',
      { versionId },
    )
    expect(byId).toContain('"isError":true')
    expect(byId).not.toContain('no author should read')
  })

  // The guard on `uploadMediaFromUrl`, over the wire rather than in isolation.
  // This tool makes the server fetch an address its caller chose, and the server
  // can reach a database, sibling containers by name, and on some hosts a
  // metadata service that hands out credentials. The unit tests cover the
  // address rules; this proves those rules are wired into the tool a client can
  // actually call, which is the part a refactor could quietly break.
  test('refuses to fetch anything that is not a public https address', async ({
    request,
  }) => {
    const refused = [
      'http://127.0.0.1:3000/health',
      'https://127.0.0.1/x.png',
      'https://169.254.169.254/latest/meta-data/',
      'https://[::1]/x.png',
      'https://localhost/x.png',
      'file:///etc/passwd',
    ]

    for (const url of refused) {
      const result = await callTool(
        request,
        fixtures.mcp.editorKey,
        'uploadMediaFromUrl',
        { alt: 'A probe that must never be fetched.', url },
      )

      // The refusal has to name the reason — the caller is a model, and a
      // generic failure invites it to retry the same way.
      expect(result, url).toMatch(
        /not a public address|Only https URLs|not a valid URL/,
      )
      // And nothing may have been stored. `sourceUrl` is only in the success
      // response, so its absence is the check — `id` appears in the JSON-RPC
      // envelope of every reply, error or not.
      expect(result, url).toContain('"isError":true')
      expect(result, url).not.toContain('sourceUrl')
    }
  })

  test('refuses an editor key trying to publish', async ({ request }) => {
    const slug = `e2e-mcp-guard-${Date.now()}-${Math.floor(Math.random() * 1e6)}`

    await callTool(request, fixtures.mcp.editorKey, 'draftArticle', {
      markdown: 'A draft nobody may publish through an editor key.',
      slug,
      title: 'E2E MCP Publish Guard',
    })

    const attempt = await callTool(
      request,
      fixtures.mcp.editorKey,
      'updatePosts',
      {
        _status: 'published',
        where: JSON.stringify({ slug: { equals: slug } }),
      },
    )

    // The guard is a `beforeChange` hook, so its message comes back as tool
    // output rather than an HTTP status — see `lib/mcp/publish-guard.ts`.
    expect(attempt).toContain('administrator')
  })
})
