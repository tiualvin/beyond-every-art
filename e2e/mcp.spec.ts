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
        'restoreArticleVersion',
        'updateArticleMarkdown',
        'setKeyFactsBlock',
        'setFAQBlock',
        'uploadMedia',
        'findPosts',
      ]),
    )

    // One tool writes history back, and its description says it overwrites.
    // A second one would have to be decided, not merely added.
    expect(tools.filter((name) => /restore/i.test(name))).toEqual([
      'restoreArticleVersion',
    ])

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

  test('sets key facts on a draft, and a revision keeps them', async ({
    request,
  }) => {
    // The one place the written block meets Payload's real save — its hooks,
    // its rich-text validation, Postgres — rather than a stub.
    const key = fixtures.mcp.editorKey
    const slug = `e2e-mcp-facts-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const facts = [
      { label: 'Insect', value: 'Dactylopius coccus' },
      { label: 'Yield', value: '~70,000 insects per lb' },
    ]
    type Read = {
      markdown: string
      blocks: Array<{ fields: { items: unknown[] } }>
    }

    await callToolJson(request, key, 'draftArticle', {
      markdown:
        '## The short answer\n\n| | |\n|---|---|\n| Insect | Dactylopius coccus |\n\n' +
        '## The insect\n\nA scale insect.\n',
      slug,
      title: 'E2E MCP Key Facts',
    })

    const set = await callToolJson(request, key, 'setKeyFactsBlock', {
      afterHeading: 'The short answer',
      facts,
      replacePipeTable: true,
      slug,
    })
    expect(set).toMatchObject({
      placement: 'inserted',
      removedTable: true,
      status: 'draft',
    })
    const { key: blockKey, marker } = set.keyFacts as {
      key: string
      marker: string
    }

    const read = (await callToolJson(request, key, 'readArticleMarkdown', {
      slug,
    })) as Read
    expect(read.markdown).toContain(marker)
    expect(read.markdown).not.toContain('|---|')
    expect(read.blocks).toHaveLength(1)
    expect(read.blocks[0].fields.items).toEqual([
      expect.objectContaining(facts[0]),
      expect.objectContaining(facts[1]),
    ])

    const revised = await callToolJson(request, key, 'updateArticleMarkdown', {
      markdown: read.markdown.replace(
        'A scale insect.',
        'A small scale insect.',
      ),
      slug,
    })
    expect(revised.blocks).toEqual({
      kept: [{ key: blockKey, blockType: 'keyFacts' }],
      removed: [],
    })

    const reread = (await callToolJson(request, key, 'readArticleMarkdown', {
      slug,
    })) as Read
    expect(reread.markdown).toContain('A small scale insect.')
    expect(reread.blocks).toEqual(read.blocks)
  })

  test('converts a Markdown FAQ to an FAQ module, and a revision keeps it', async ({
    request,
  }) => {
    // Rich-text answers meet Payload's real save here, validation and all.
    const key = fixtures.mcp.editorKey
    const slug = `e2e-mcp-faq-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    type Read = {
      markdown: string
      blocks: Array<{
        blockType: string
        fields: { heading: string; items: Array<{ answer: string }> }
      }>
    }

    await callToolJson(request, key, 'draftArticle', {
      markdown:
        '## The insect\n\nA scale insect.\n\n## FAQ\n\n' +
        '**What is it made from?** Dried insects.\n\n' +
        '**Is it still used?** Yes.\n\n## The claim\n\nRed.\n',
      slug,
      title: 'E2E MCP FAQ',
    })

    const set = await callToolJson(request, key, 'setFAQBlock', {
      afterHeading: 'FAQ',
      items: [
        { question: 'What is it made from?', answer: 'Dried **insects**.' },
        { question: 'Is it still used?', answer: 'Yes, as E120.' },
      ],
      replaceExisting: true,
      slug,
    })
    expect(set).toMatchObject({
      placement: 'inserted',
      replacedSection: 'FAQ',
      status: 'draft',
    })
    const { marker } = set.faq as { marker: string }

    const read = (await callToolJson(request, key, 'readArticleMarkdown', {
      slug,
    })) as Read
    expect(read.markdown).toContain(marker)
    expect(read.markdown).not.toContain('**What is it made from?**')
    expect(read.blocks).toHaveLength(1)
    expect(read.blocks[0].fields.heading).toBe('FAQ')
    expect(read.blocks[0].fields.items[0].answer).toBe('Dried **insects**.')

    const revised = await callToolJson(request, key, 'updateArticleMarkdown', {
      markdown: read.markdown.replace('Red.', 'A red worth an empire.'),
      slug,
    })
    expect((revised.blocks as { kept: unknown[] }).kept).toHaveLength(1)

    const reread = (await callToolJson(request, key, 'readArticleMarkdown', {
      slug,
    })) as Read
    expect(reread.markdown).toContain('A red worth an empire.')
    expect(reread.blocks).toEqual(read.blocks)
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

  // The revert, over the wire and on the case it exists for: a body holding a
  // block, which the Markdown route destroys. The version restored is a
  // published one, which is the case Payload's own `restoreVersion` gets wrong
  // for an editor key — it hands the publish guard the snapshot's status.
  test('reverts to a published version exactly, as a draft, and can be undone', async ({
    request,
  }) => {
    const slug = `e2e-mcp-restore-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const where = JSON.stringify({ slug: { equals: slug } })
    const paragraph = (words: string) => ({
      children: [
        {
          detail: 0,
          format: 0,
          mode: 'normal',
          style: '',
          text: words,
          type: 'text',
          version: 1,
        },
      ],
      direction: 'ltr',
      format: '',
      indent: 0,
      textFormat: 0,
      type: 'paragraph',
      version: 1,
    })
    const root = (children: unknown[]) => ({
      root: {
        children,
        direction: 'ltr',
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
      },
    })

    await callToolJson(request, fixtures.mcp.editorKey, 'draftArticle', {
      markdown: 'A first body.',
      slug,
      title: 'E2E MCP Restored Article',
    })
    // The generated tools answer in prose rather than JSON, so these two are
    // checked for success rather than parsed.
    const withBlock = await callTool(
      request,
      fixtures.mcp.editorKey,
      'updatePosts',
      {
        content: root([
          paragraph('Block survivor opens the article.'),
          {
            fields: {
              blockName: '',
              blockType: 'callout',
              content: root([paragraph('A callout Markdown cannot carry.')]),
              emoji: '',
              id: '65f0c0ffee0000000000abcd',
              tone: 'accent',
            },
            format: '',
            type: 'block',
            version: 2,
          },
        ]),
        where,
      },
    )
    expect(withBlock).not.toContain('"isError":true')
    const publish = await callTool(
      request,
      fixtures.mcp.adminKey,
      'updatePosts',
      {
        _status: 'published',
        where,
      },
    )
    expect(publish).not.toContain('"isError":true')

    // An agent's revision through Markdown: the callout does not survive it.
    await callToolJson(
      request,
      fixtures.mcp.editorKey,
      'updateArticleMarkdown',
      {
        markdown: 'Rewritten body, with no callout.',
        slug,
      },
    )

    const { versions } = (await callToolJson(
      request,
      fixtures.mcp.editorKey,
      'listArticleVersions',
      { slug },
    )) as { versions: Array<{ status: string; versionId: string }> }
    const published = versions.find((version) => version.status === 'published')
    expect(published, JSON.stringify(versions)).toBeDefined()

    const preview = await callToolJson(
      request,
      fixtures.mcp.editorKey,
      'restoreArticleVersion',
      { dryRun: true, scope: 'body', versionId: published!.versionId },
    )
    expect(preview).toMatchObject({ changes: ['content'], dryRun: true })

    // An editor key, reverting to a published version, and not refused.
    const restored = await callToolJson(
      request,
      fixtures.mcp.editorKey,
      'restoreArticleVersion',
      { scope: 'body', versionId: published!.versionId },
    )
    expect(restored).toMatchObject({
      changed: ['content'],
      slug,
      status: 'draft',
    })
    expect(restored.undo).toBeTruthy()

    // The block came back as stored, which only an administrator's REST read
    // can show: Markdown has no way to express it.
    const login = await request.post('/api/users/login/', {
      data: { email: fixtures.mcp.adminEmail, password: fixtures.mcp.password },
    })
    expect(login.status()).toBe(200)
    const { token } = (await login.json()) as { token: string }
    const draft = await request.get(
      `/api/posts/${restored.id}/?draft=true&depth=0`,
      { headers: { Authorization: `JWT ${token}` } },
    )
    const draftBody = JSON.stringify(
      ((await draft.json()) as { content: unknown }).content,
    )
    expect(draftBody).toContain('"blockType":"callout"')
    expect(draftBody).toContain('A callout Markdown cannot carry.')
    expect(draftBody).not.toContain('Rewritten body')

    // Undo: the draft it replaced comes back.
    await callToolJson(
      request,
      fixtures.mcp.editorKey,
      'restoreArticleVersion',
      {
        scope: 'body',
        versionId: restored.undo,
      },
    )
    const undone = await callToolJson(
      request,
      fixtures.mcp.editorKey,
      'readArticleMarkdown',
      { slug },
    )
    expect(undone.markdown).toContain('Rewritten body')

    // And through all of it the live article neither changed nor went back to
    // draft: two restores, one of them to a draft version, and the page a
    // reader gets is still the one an administrator published.
    const live = await request.get(
      `/api/posts/?where[slug][equals]=${slug}&depth=0`,
    )
    const [liveDoc] = (
      (await live.json()) as { docs: Array<Record<string, unknown>> }
    ).docs
    expect(liveDoc?._status).toBe('published')
    expect(JSON.stringify(liveDoc.content)).toContain('"blockType":"callout"')
    expect(JSON.stringify(liveDoc.content)).not.toContain('Rewritten body')
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
