import type { PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { Posts } from '../../collections/Posts'
import { mcpPluginConfig } from '../../lib/mcp/plugin'
import { KEPT_ON_RESTORE, mcpTools, RESTORED_FIELDS } from '../../lib/mcp/tools'
import { flattenFields } from '../support/fields'
import { nativeGhostID } from '../../lib/migration/native-id'

describe('nativeGhostID', () => {
  // `ghostID` stays unique so the Ghost import remains idempotent. A natively
  // authored article is autofilled with one of these by the field itself, and
  // it has to be a value the export could never also contain.
  it('is namespaced so it cannot collide with a Ghost ObjectID', () => {
    const id = nativeGhostID()

    expect(id.startsWith('native:')).toBe(true)
    expect(id).not.toMatch(/^[a-f0-9]{24}$/)
  })

  it('is unique per call', () => {
    expect(nativeGhostID()).not.toBe(nativeGhostID())
  })
})

describe('mcpTools', () => {
  it('exposes the drafting loop: create, read back, look back, revise, add facts, illustrate', () => {
    expect(mcpTools.map((tool) => tool.name)).toEqual([
      'draftArticle',
      'readArticleMarkdown',
      'listArticleVersions',
      'readArticleVersion',
      'restoreArticleVersion',
      'updateArticleMarkdown',
      'setKeyFactsBlock',
      'uploadMedia',
      'uploadMediaFromUrl',
    ])
  })

  // The base64 tool cannot be called from a connector — the bytes would have to
  // pass through the model's context — so a client that can only hand over a
  // link needs the URL one to exist and to say so in its description. This
  // asserts the pair stays a pair.
  it('offers a way to illustrate that does not go through the model', () => {
    const fromUrl = mcpTools.find((tool) => tool.name === 'uploadMediaFromUrl')
    expect(fromUrl).toBeDefined()
    expect(fromUrl!.description).toMatch(/https/)
    expect(fromUrl!.description).toMatch(/phone|scheduled/)
  })

  it('describes every tool, since that is what a client selects on', () => {
    for (const tool of mcpTools) {
      expect(tool.description.length).toBeGreaterThan(20)
    }
  })
})

/** A tool from the real list, so a test cannot pass against a renamed one. */
function tool(name: string) {
  const found = mcpTools.find((candidate) => candidate.name === name)
  expect(found, name).toBeDefined()
  return found!
}

/**
 * A request whose Payload has only the methods named, as spies.
 *
 * Anything else throws, which is what makes "read-only" checkable: a version
 * tool that reached for `update`, `create` or `restoreVersion` would fail here
 * rather than quietly writing to a stub.
 */
function stubRequest(methods: Record<string, (...args: never[]) => unknown>) {
  const spies = Object.fromEntries(
    Object.entries(methods).map(([name, impl]) => [name, vi.fn(impl)]),
  )
  const payload = new Proxy(spies, {
    get(target, property) {
      if (property in target) return target[property as string]
      throw new Error(`unexpected payload.${String(property)}`)
    },
  })
  const user = { collection: 'users', id: 7, role: 'editor' }
  return {
    payload,
    req: { payload, user } as unknown as PayloadRequest,
    spies,
    user,
  }
}

async function call(
  name: string,
  args: Record<string, unknown>,
  req: PayloadRequest,
) {
  const result = (await tool(name).handler(args, req, undefined)) as {
    content: Array<{ text: string }>
  }
  return JSON.parse(result.content[0].text) as Record<string, unknown>
}

// A migrated post's body, which reads back as a note rather than Markdown and
// so needs no booted editor config — the Lexical path is exercised end to end
// in `e2e/mcp.spec.ts`, where the config is real.
const migrated = {
  _status: 'draft',
  content: null,
  excerpt: 'An excerpt as it was.',
  legacyHTML:
    '<h2>Ground layers</h2><p>Lead white,   <em>chalk</em> and glue: the ground decides how a painting ages long after the varnish is forgotten.</p>',
  slug: 'ground-layers',
  title: 'Ground Layers, earlier',
}

describe('version history tools', () => {
  // A caller — a model, usually — could easily take "restore" to mean "merge",
  // and a merge is what it would want if the article has gained images or
  // tags since. The restore overwrites, and the one place that can tell the
  // caller so before it acts is the description it selects the tool by.
  it('says in so many words that restoring overwrites rather than merges', () => {
    const { description, parameters } = tool('restoreArticleVersion')
    expect(description).toMatch(/OVERWRITES; it does not merge/)
    expect(description).toMatch(/images, tags/)
    expect(description).toMatch(/always a draft/)
    expect(description).toContain('dryRun')
    expect(parameters.scope.description).toMatch(/overwritten, not merged/)
  })

  // There is exactly one tool that writes history back, and it is the one
  // whose description and tests say what it overwrites.
  it('offers no other way to restore a version', () => {
    const restoring = mcpTools
      .map(({ name }) => name)
      .filter((name) => /restore|revert|rollback/i.test(name))
    expect(restoring).toEqual(['restoreArticleVersion'])
  })

  it('tells the caller how to bring old text back without losing newer fields', () => {
    const { description } = tool('readArticleVersion')
    expect(description).toMatch(/read-only/i)
    expect(description).toContain('updateArticleMarkdown')
    expect(description).toContain('restoreArticleVersion')
    expect(description).toMatch(/overwrites rather than merges/)
  })

  // A field added to Posts is left alone by a restore until someone decides
  // otherwise — but that decision has to be made, not defaulted. Each field is
  // either put back or kept, never both and never neither.
  it('decides, for every field on Posts, whether a restore puts it back', () => {
    const system = new Set(['_status', 'createdAt', 'deletedAt', 'updatedAt'])
    const named = flattenFields(Posts.fields)
      // `ui` fields draw something on the edit screen and store nothing.
      .filter(
        (field) =>
          'name' in field && field.type !== 'ui' && !system.has(field.name),
      )
      .map((field) => (field as { name: string }).name)

    const restored = new Set<string>(RESTORED_FIELDS.article)
    const kept = new Set<string>(KEPT_ON_RESTORE)

    expect([...restored].filter((name) => kept.has(name))).toEqual([])
    expect(
      named.filter((name) => !restored.has(name) && !kept.has(name)),
    ).toEqual([])
    expect(
      [...restored, ...kept].filter((name) => !named.includes(name)),
    ).toEqual([])
    for (const name of RESTORED_FIELDS.body) expect(restored).toContain(name)
  })

  // What decides where, when and to whom a post is served. Restoring any of
  // these would change a URL, a paywall or what crawlers are told the next
  // time somebody presses publish, with nothing on the edit screen saying so.
  it.each([
    'slug',
    'visibility',
    'canonicalURL',
    'noindex',
    'publishedAt',
    'owners',
  ])('never restores %s', (field) => {
    expect(KEPT_ON_RESTORE as readonly string[]).toContain(field)
  })

  // Posts keep `maxPerDoc` versions and no more, so a lower ceiling would hide
  // history that exists and a higher one would promise history that does not.
  it('lets a listing reach every version a post keeps, and no further', () => {
    const limit = tool('listArticleVersions').parameters.limit!
    const maxPerDoc = (Posts.versions as { maxPerDoc?: number }).maxPerDoc!

    expect(limit.safeParse(maxPerDoc).success).toBe(true)
    expect(limit.safeParse(maxPerDoc + 1).success).toBe(false)
    expect(limit.safeParse(0).success).toBe(false)
    expect(limit.safeParse(undefined).success).toBe(true)
  })

  it('lists versions through the same lookup and access as readArticleMarkdown', async () => {
    const { req, spies, user } = stubRequest({
      find: () => ({ docs: [{ id: 42, slug: 'ground-layers' }] }),
      findVersions: () => ({
        docs: [
          {
            autosave: true,
            id: 901,
            latest: true,
            updatedAt: '2026-09-27T10:00:00.000Z',
            version: migrated,
          },
          {
            id: 900,
            updatedAt: '2026-09-26T10:00:00.000Z',
            version: {
              ...migrated,
              _status: 'published',
              legacyHTML: '<p>Short.</p>',
            },
          },
        ],
        totalDocs: 2,
      }),
    })

    const listed = await call(
      'listArticleVersions',
      { slug: 'ground-layers' },
      req,
    )

    // The slug is resolved exactly as `readArticleMarkdown` resolves it.
    expect(spies.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'posts',
        draft: true,
        overrideAccess: false,
        user,
        where: { slug: { equals: 'ground-layers' } },
      }),
    )
    expect(spies.findVersions).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'posts',
        depth: 0,
        limit: 20,
        overrideAccess: false,
        sort: '-updatedAt',
        user,
        where: { parent: { equals: 42 } },
      }),
    )

    expect(listed).toMatchObject({
      id: 42,
      slug: 'ground-layers',
      totalVersions: 2,
    })
    const [newest, older] = listed.versions as Array<Record<string, unknown>>
    expect(newest).toEqual({
      autosave: true,
      latest: true,
      // Tags gone, whitespace collapsed, cut at a hundred characters.
      snippet:
        'Ground layers Lead white, chalk and glue: the ground decides how a painting ages long after the varn…',
      status: 'draft',
      title: 'Ground Layers, earlier',
      updatedAt: '2026-09-27T10:00:00.000Z',
      // A string, because that is what `readArticleVersion` accepts.
      versionId: '901',
    })
    expect(older).toMatchObject({
      autosave: false,
      latest: false,
      snippet: 'Short.',
      status: 'published',
      versionId: '900',
    })
    // No bodies in a listing: that is what `readArticleVersion` is for.
    expect(JSON.stringify(listed)).not.toContain('<p>')
    expect(newest).not.toHaveProperty('markdown')
  })

  it('refuses to list history for a document the key cannot read', async () => {
    const { req, spies } = stubRequest({
      find: () => ({ docs: [] }),
      findVersions: () => ({ docs: [], totalDocs: 0 }),
    })

    await expect(
      call('listArticleVersions', { slug: 'not-yours' }, req),
    ).rejects.toThrow(/No posts document with slug/)
    expect(spies.findVersions).not.toHaveBeenCalled()
  })

  it('reads one version read-only, in the shape readArticleMarkdown returns', async () => {
    const { req, spies, user } = stubRequest({
      findByID: () => ({ ...migrated, id: 42 }),
      findVersionByID: () => ({
        autosave: false,
        id: 900,
        latest: false,
        // An id rather than a document: the read is made at depth 0.
        parent: 42,
        updatedAt: '2026-09-26T10:00:00.000Z',
        version: migrated,
      }),
    })

    const version = await call('readArticleVersion', { versionId: '900' }, req)

    const options = spies.findVersionByID.mock.calls[0][0] as Record<
      string,
      unknown
    >
    // Depth 0, the same depth `findArticle` reads the live draft at. An image
    // in the body exports as `![alt](url)` only when populated, so a version
    // read at any other depth would differ from the draft where the text did
    // not — and only the unpopulated form survives a revision.
    expect(options).toMatchObject({
      collection: 'posts',
      depth: 0,
      id: '900',
      overrideAccess: false,
      user,
    })

    expect(version).toEqual({
      autosave: false,
      // The migrated fixture has no rich-text body, so no modules.
      blocks: [],
      excerpt: 'An excerpt as it was.',
      id: 42,
      latest: false,
      markdown: expect.stringContaining('legacyHTML'),
      slug: 'ground-layers',
      status: 'draft',
      title: 'Ground Layers, earlier',
      updatedAt: '2026-09-26T10:00:00.000Z',
      versionId: '900',
    })

    // Every field readArticleMarkdown returns for the same stored document,
    // with the same value: the two are meant to be compared side by side.
    const current = await call('readArticleMarkdown', { id: '42' }, req)
    for (const [field, value] of Object.entries(current)) {
      expect(version[field], field).toEqual(value)
    }
  })
})

describe('restoreArticleVersion', () => {
  const oldBody = {
    root: { children: [{ type: 'block', fields: { blockType: 'callout' } }] },
  }
  const newBody = { root: { children: [{ type: 'paragraph' }] } }

  // The version as it was saved: an older body and tags, and — deliberately —
  // a different slug and visibility, which a restore must never carry back.
  const saved = {
    _status: 'published',
    authors: [3],
    content: oldBody,
    slug: 'old-address',
    tags: [1],
    title: 'Ground Layers, earlier',
    visibility: 'paid',
  }
  const current = {
    _status: 'draft',
    authors: [3],
    content: newBody,
    id: 42,
    slug: 'ground-layers',
    tags: [1, 2],
    title: 'Ground Layers',
    visibility: 'public',
  }

  const request = (update?: (options: { data: object }) => object) =>
    stubRequest({
      findByID: () => current,
      findVersionByID: () => ({
        id: 900,
        parent: 42,
        updatedAt: '2026-09-26T10:00:00.000Z',
        version: saved,
      }),
      findVersions: () => ({ docs: [{ id: 950 }], totalDocs: 3 }),
      ...(update ? { update } : {}),
    })

  it('writes nothing on a dry run, and says what would change', async () => {
    // No `update` on the stub: reaching for it would throw.
    const { req, spies, user } = request()

    const result = await call(
      'restoreArticleVersion',
      { dryRun: true, scope: 'article', versionId: '900' },
      req,
    )

    expect(result).toMatchObject({
      changes: ['content', 'title', 'tags'],
      dryRun: true,
      id: 42,
      scope: 'article',
      slug: 'ground-layers',
      versionId: '900',
    })
    // Ids, not populated documents: the form a write takes, and the form two
    // values must share to be compared.
    expect(spies.findVersionByID).toHaveBeenCalledWith(
      expect.objectContaining({ depth: 0, overrideAccess: false, user }),
    )
    expect(spies.findByID).toHaveBeenCalledWith(
      expect.objectContaining({ depth: 0, draft: true, id: 42, user }),
    )
  })

  it('restores the scope as a draft, and nothing outside it', async () => {
    const { req, spies, user } = request(({ data }) => ({
      ...current,
      ...data,
    }))

    const result = await call(
      'restoreArticleVersion',
      { scope: 'body', versionId: '900' },
      req,
    )

    const options = spies.update.mock.calls[0][0] as {
      data: Record<string, unknown>
    }
    expect(options).toMatchObject({
      collection: 'posts',
      draft: true,
      id: 42,
      overrideAccess: false,
      user,
    })
    // The body as stored — the block included — and a draft status, whatever
    // status the version had: publishing stays a person's act.
    expect(options.data).toEqual({ _status: 'draft', content: oldBody })

    expect(result).toMatchObject({
      changed: ['content'],
      dryRun: false,
      status: 'draft',
      // The draft this replaced, which restores the restore.
      undo: '950',
    })
  })

  it('never carries the URL, the paywall or ownership back, even for the whole article', async () => {
    const { req, spies } = request(({ data }) => ({ ...current, ...data }))

    await call(
      'restoreArticleVersion',
      { scope: 'article', versionId: '900' },
      req,
    )

    const { data } = spies.update.mock.calls[0][0] as {
      data: Record<string, unknown>
    }
    for (const field of KEPT_ON_RESTORE) expect(data).not.toHaveProperty(field)
    expect(data).toMatchObject({ tags: [1], title: 'Ground Layers, earlier' })
  })

  // Payload keeps a field the key may not update and says nothing, so the
  // report is taken from what landed rather than from what was sent.
  it('reports what landed, not what was asked for', async () => {
    const { req } = request(() => current)

    const result = await call(
      'restoreArticleVersion',
      { scope: 'body', versionId: '900' },
      req,
    )

    expect(result.changed).toEqual([])
  })
})

describe('mcpPluginConfig', () => {
  // The plugin exposes nothing it is not told to. These four hold personal,
  // billing, and credential data and have no editorial use over MCP.
  it.each(['members', 'billing-events', 'newsletter-signups', 'users'])(
    'does not expose %s',
    (slug) => {
      expect(mcpPluginConfig.collections).not.toHaveProperty(slug)
    },
  )

  it('never allows an agent to delete an article', () => {
    expect(mcpPluginConfig.collections?.posts?.enabled).toMatchObject({
      delete: false,
    })
  })

  it('exposes no globals', () => {
    expect(mcpPluginConfig.globals ?? {}).toEqual({})
  })

  // Without this, one unbounded `findPosts` answers with every migrated
  // article's full Ghost body.
  it('keeps article bodies out of generated find responses', () => {
    expect(mcpPluginConfig.collections?.posts?.overrideResponse).toBeTypeOf(
      'function',
    )
  })

  // The only place a read is visible at all: nothing else in the stack logs a
  // tool call that did not write a document.
  it('logs every JSON-RPC call through the handler event hook', () => {
    expect(mcpPluginConfig.mcp?.handlerOptions?.onEvent).toBeTypeOf('function')
  })

  // Collection files written to disk, `payload.config.ts` rewritten in place,
  // and password reset / account unlock tools are all things this endpoint has
  // no business offering.
  it('enables no experimental tools', () => {
    expect(mcpPluginConfig.experimental).toBeUndefined()
  })
})
