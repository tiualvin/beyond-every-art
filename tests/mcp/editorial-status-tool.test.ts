import type { PayloadRequest } from 'payload'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { mcpTools } from '../../lib/mcp/tools'

const NOW = new Date('2026-10-14T16:00:00.000Z')

function tool() {
  const found = mcpTools.find(
    (candidate) => candidate.name === 'editorialStatus',
  )
  expect(found).toBeDefined()
  return found!
}

/** A Payload whose every read returns `docs`, recording what was asked. */
function request(docs: Array<Record<string, unknown>> = []) {
  const find = vi.fn(async () => ({ docs, totalDocs: docs.length }))
  const payload = new Proxy(
    { find },
    {
      get(target, property) {
        if (property in target) return target[property as 'find']
        throw new Error(`unexpected payload.${String(property)}`)
      },
    },
  )
  const user = { collection: 'users', id: 7, role: 'editor' }
  return {
    find,
    req: { payload, payloadAPI: 'MCP', user } as unknown as PayloadRequest,
    user,
  }
}

async function call(req: PayloadRequest, args: Record<string, unknown> = {}) {
  const result = (await tool().handler(args, req, undefined as never)) as {
    content: Array<{ text: string }>
  }
  return JSON.parse(result.content[0].text) as Record<string, unknown>
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('editorialStatus', () => {
  // Read-only: the stub throws on anything but `find`, so a write would fail.
  it("reads with the caller's own access, and never a body", async () => {
    const { find, req, user } = request()

    await call(req)

    expect(find).toHaveBeenCalled()
    for (const [args] of find.mock.calls as unknown as Array<
      [
        {
          overrideAccess: boolean
          select: Record<string, unknown>
          user: unknown
        },
      ]
    >) {
      expect(args.overrideAccess).toBe(false)
      expect(args.user).toBe(user)
      expect(Object.keys(args.select)).not.toContain('content')
      expect(Object.keys(args.select)).not.toContain('legacyHTML')
    }
  })

  it('lists the window ahead and behind, oldest slot first ahead', async () => {
    const { find, req } = request()

    await call(req, { days: 7 })

    const calls = find.mock.calls as unknown as Array<
      [{ sort?: string; where: { and?: Array<Record<string, unknown>> } }]
    >
    const ahead = calls.find(([args]) => args.sort === 'publishedAt')![0]
    expect(ahead.where.and).toContainEqual({
      publishedAt: { greater_than: NOW.toISOString() },
    })
    expect(ahead.where.and).toContainEqual({
      publishedAt: { less_than_equal: '2026-10-21T16:00:00.000Z' },
    })
    const behind = calls.find(([args]) => args.sort === '-publishedAt')![0]
    expect(behind.where.and).toContainEqual({
      publishedAt: { greater_than: '2026-10-07T16:00:00.000Z' },
    })
  })

  it('gives each article its address', async () => {
    const { req } = request([
      {
        id: 201,
        publishedAt: '2026-10-14T16:00:00.000Z',
        slug: 'how-artists-trick-the-eye-perspective-illusion',
        title: 'How Artists Trick the Eye',
      },
    ])

    const status = await call(req)

    const wentLive = status.wentLive as {
      articles: Array<{ url: string }>
    }
    expect(wentLive.articles[0].url).toMatch(
      /\/how-artists-trick-the-eye-perspective-illusion\/$/,
    )
    expect(status.releaseWithinMinutes).toBe(10)
    expect(status).toHaveProperty('savedButNotOut')
  })

  it('bounds the window', () => {
    const { days } = tool().parameters
    expect(days.safeParse(90).success).toBe(true)
    expect(days.safeParse(91).success).toBe(false)
    expect(days.safeParse(0).success).toBe(false)
  })
})
