import type { PayloadRequest } from 'payload'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { mcpTools, resolvePublishAt } from '../../lib/mcp/tools'

// `publishArticle` reads two different things and must never confuse them: the
// newest version, which is what goes out, and the live row, which is what
// readers see now. The stub keeps them apart the way the database does. The
// same behaviour was checked against a real database before this was written.

const NOW = new Date('2026-10-14T16:00:00.000Z')

type Doc = Record<string, unknown> & { id: number }

function request({
  newest,
  live,
  role = 'admin',
  context = {},
}: {
  newest: Doc
  live: Doc
  role?: string
  context?: Record<string, unknown>
}) {
  const payload = {
    findByID: vi.fn(async () => newest),
    find: vi.fn(async (args: { draft?: boolean }) => ({
      docs: [args.draft ? newest : live],
    })),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      ...newest,
      ...data,
    })),
  }
  const req = {
    context,
    payload,
    payloadAPI: 'MCP',
    user: { collection: 'users', id: 1, role },
  } as unknown as PayloadRequest
  return { payload, req }
}

async function publish(req: PayloadRequest, args: Record<string, unknown>) {
  const tool = mcpTools.find((candidate) => candidate.name === 'publishArticle')
  expect(tool).toBeDefined()
  const result = (await tool!.handler(args, req, undefined as never)) as {
    content: Array<{ text: string }>
  }
  return JSON.parse(result.content[0].text) as Record<string, unknown>
}

const liveRow: Doc = {
  id: 186,
  _status: 'published',
  slug: 'sfumato',
  title: 'The Technique With No Edges',
  content: { root: { children: ['the live body'] } },
  publishedAt: '2026-10-08T22:00:00.000Z',
  canonicalURL: null,
  lastEditedBy: 'person',
  updatedAt: '2026-09-30T23:41:54.663Z',
}
// What an agent's revision leaves on top of it: a draft, nobody published.
const revision: Doc = {
  ...liveRow,
  _status: 'draft',
  content: { root: { children: ['the revised body'] } },
  lastEditedBy: 'agent',
  updatedAt: '2026-10-07T03:16:21.937Z',
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('publishArticle', () => {
  it('publishes the newest version whole, in place, keeping its date', async () => {
    const { payload, req } = request({ newest: revision, live: liveRow })

    const result = await publish(req, { id: '186' })

    const [[call]] = payload.update.mock.calls as unknown as Array<
      [
        {
          data: Record<string, unknown>
          draft: boolean
          overrideAccess: boolean
        },
      ]
    >
    expect(call.draft).toBe(false)
    expect(call.overrideAccess).toBe(false)
    expect(call.data).toMatchObject({
      _status: 'published',
      content: revision.content,
      publishedAt: liveRow.publishedAt,
      slug: 'sfumato',
    })
    for (const system of ['id', 'createdAt', 'updatedAt', 'deletedAt']) {
      expect(call.data).not.toHaveProperty(system)
    }
    expect(result).toMatchObject({
      after: 'live',
      before: 'live',
      changes: ['content'],
      publishedAt: liveRow.publishedAt,
      status: 'published',
    })
  })

  it('says what would go out, and whether this key may, without writing', async () => {
    const { payload, req } = request({
      newest: revision,
      live: liveRow,
      role: 'editor',
    })

    const result = await publish(req, { dryRun: true, id: '186' })

    expect(payload.update).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      changes: ['content'],
      dryRun: true,
      mayPublish: false,
    })
  })

  it('reports a connector granted publishing as able to publish', async () => {
    const { req } = request({
      newest: revision,
      live: liveRow,
      context: { mcpViaOAuth: true, mcpGrantMayPublish: true },
    })

    expect(await publish(req, { dryRun: true, id: '186' })).toMatchObject({
      mayPublish: true,
    })
  })

  // A date ahead takes the page off the site until then; "now" re-dates it to
  // the top of every listing. Neither is what "publish the changes" means.
  it("never moves a live article's date", async () => {
    const { payload, req } = request({ newest: revision, live: liveRow })

    for (const publishAt of ['now', '2026-11-04T20:00:00Z']) {
      await expect(publish(req, { id: '186', publishAt })).rejects.toThrow(
        /has been live since/,
      )
    }
    expect(payload.update).not.toHaveBeenCalled()
  })

  it.each(['slug', 'canonicalURL'])(
    "refuses to change a live article's %s",
    async (field) => {
      const { payload, req } = request({
        newest: { ...revision, [field]: 'somewhere-else' },
        live: liveRow,
      })

      await expect(publish(req, { id: '186' })).rejects.toThrow(
        new RegExp(`changes this live article's ${field}`),
      )
      expect(payload.update).not.toHaveBeenCalled()
    },
  )

  // The case of #212: never published, carrying a date that passed while it
  // sat as a draft. Published as it was, it would have gone out a week
  // backdated, below everything newer.
  const staleDraft: Doc = {
    id: 212,
    _status: 'draft',
    slug: 'atmospheric-perspective-blue-of-distance',
    title: 'The Blue of Distance',
    content: { root: { children: ['body'] } },
    publishedAt: '2026-10-07T19:00:00.000Z',
  }
  const neverPublished: Doc = { ...staleDraft, publishedAt: null }

  it('refuses to backdate an article that was never published', async () => {
    const { payload, req } = request({
      newest: staleDraft,
      live: neverPublished,
    })

    await expect(publish(req, { id: '212' })).rejects.toThrow(/backdated/)
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('schedules an article that is not live for a time ahead', async () => {
    const { payload, req } = request({
      newest: staleDraft,
      live: neverPublished,
    })

    const result = await publish(req, {
      id: '212',
      publishAt: '2026-11-04T20:00:00Z',
    })

    const [[call]] = payload.update.mock.calls as unknown as Array<
      [{ data: Record<string, unknown> }]
    >
    expect(call.data).toMatchObject({
      _status: 'published',
      publishedAt: '2026-11-04T20:00:00.000Z',
    })
    expect(result).toMatchObject({
      after: 'scheduled',
      before: 'unpublished',
      changes: null,
    })
    expect(result.appears).toMatch(/2026-11-04T20:00:00.000Z/)
  })

  it('leaves the date to the publish hook when there is none', async () => {
    const undated = { ...neverPublished }
    const { payload, req } = request({ newest: undated, live: undated })

    await publish(req, { id: '212' })

    const [[call]] = payload.update.mock.calls as unknown as Array<
      [{ data: Record<string, unknown> }]
    >
    expect(call.data).not.toHaveProperty('publishedAt')
  })
})

describe('resolvePublishAt', () => {
  it('takes "now" and a zoned time ahead', () => {
    expect(resolvePublishAt('now', NOW)).toBe(NOW.toISOString())
    expect(resolvePublishAt(' NOW ', NOW)).toBe(NOW.toISOString())
    expect(resolvePublishAt('2026-11-04T15:00:00-05:00', NOW)).toBe(
      '2026-11-04T20:00:00.000Z',
    )
    expect(resolvePublishAt(undefined, NOW)).toBeUndefined()
  })

  // "20:00" without an offset is a different moment on every server.
  it('refuses a time that does not say which zone it is in', () => {
    expect(() => resolvePublishAt('2026-11-04T20:00', NOW)).toThrow(/offset/)
    expect(() => resolvePublishAt('next Tuesday', NOW)).toThrow(/offset/)
  })

  it('refuses a time that has passed', () => {
    expect(() => resolvePublishAt('2026-10-08T00:00:00Z', NOW)).toThrow(
      /has passed/,
    )
  })
})
