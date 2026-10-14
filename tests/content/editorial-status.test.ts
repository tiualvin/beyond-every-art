import type { Payload } from 'payload'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { EditorialDashboard } from '../../components/admin/EditorialDashboard'
import { findUnpublishedWork } from '../../lib/content/editorial-status'

const NOW = new Date('2026-10-14T16:00:00.000Z')

type Doc = Record<string, unknown> & { id: number }

/**
 * A Payload whose `find` answers from two tables: the newest version of each
 * post (read with `draft: true`) and the live rows. That split is the whole
 * subject — see `lib/content/editorial-status.ts`.
 */
function payloadWith({ latest, live }: { latest: Doc[]; live: Doc[] }) {
  const find = vi.fn(
    async (args: {
      draft?: boolean
      where?: { _status?: unknown; and?: Array<Record<string, unknown>> }
    }) => {
      if (args.draft) {
        return {
          docs: latest.filter((doc) => doc._status === 'draft'),
        }
      }
      const ids = (
        args.where?.and?.find((clause) => 'id' in clause)?.id as {
          in: number[]
        }
      ).in
      return {
        docs: live.filter(
          (doc) => ids.includes(doc.id) && doc._status === 'published',
        ),
      }
    },
  )
  return { payload: { find } as unknown as Payload, find }
}

// The state of 14 Oct 2026, in miniature: a live article with an agent's
// unpublished edit on top, a scheduled one with the same, the one genuinely
// unpublished draft whose date had passed, and an ordinary draft.
const latest: Doc[] = [
  {
    id: 186,
    _status: 'draft',
    slug: 'sfumato',
    title: 'The Technique With No Edges',
    publishedAt: '2026-10-08T22:00:00.000Z',
    updatedAt: '2026-10-07T03:16:21.937Z',
  },
  {
    id: 300,
    _status: 'draft',
    slug: 'later',
    title: 'Later',
    publishedAt: '2026-10-30T16:00:00.000Z',
    updatedAt: '2026-10-10T00:00:00.000Z',
  },
  {
    id: 212,
    _status: 'draft',
    slug: 'atmospheric-perspective-blue-of-distance',
    title: 'The Blue of Distance',
    publishedAt: '2026-10-07T19:00:00.000Z',
    updatedAt: '2026-10-05T23:17:45.145Z',
  },
  {
    id: 400,
    _status: 'draft',
    slug: 'undated',
    title: 'Undated',
    publishedAt: null,
    updatedAt: '2026-10-12T00:00:00.000Z',
  },
  { id: 164, _status: 'published', slug: 'composers', title: 'Composers' },
]
const live: Doc[] = [
  {
    id: 186,
    _status: 'published',
    slug: 'sfumato',
    publishedAt: '2026-10-08T22:00:00.000Z',
  },
  { id: 300, _status: 'published', publishedAt: '2026-10-30T16:00:00.000Z' },
  { id: 212, _status: 'draft', publishedAt: null },
  { id: 400, _status: 'draft', publishedAt: null },
  { id: 164, _status: 'published', publishedAt: '2026-10-13T22:00:00.000Z' },
]

describe('findUnpublishedWork', () => {
  it('tells a live article with an unpublished edit from a draft', async () => {
    const { payload } = payloadWith({ latest, live })

    const work = await findUnpublishedWork(payload, { now: NOW })

    expect(work.liveWithChanges.map((article) => article.id)).toEqual([186])
    expect(work.scheduledWithChanges.map((article) => article.id)).toEqual([
      300,
    ])
    expect(work.draftsPastTheirDate.map((article) => article.id)).toEqual([212])
  })

  it('names a live article by the address readers use, not the draft', async () => {
    const renamed = latest.map((doc) =>
      doc.id === 186 ? { ...doc, slug: 'sfumato-renamed-in-draft' } : doc,
    )
    const { payload } = payloadWith({ latest: renamed, live })

    const [article] = (await findUnpublishedWork(payload, { now: NOW }))
      .liveWithChanges

    expect(article.slug).toBe('sfumato')
  })

  it('reports the date readers see, and when the draft was saved', async () => {
    const { payload } = payloadWith({ latest, live })

    const [article] = (await findUnpublishedWork(payload, { now: NOW }))
      .liveWithChanges

    expect(article).toEqual({
      id: 186,
      slug: 'sfumato',
      title: 'The Technique With No Edges',
      publishedAt: '2026-10-08T22:00:00.000Z',
      savedAt: '2026-10-07T03:16:21.937Z',
    })
  })

  // An author's dashboard must not count the publication's work.
  it("reads with the caller's own access, and never a body", async () => {
    const { payload, find } = payloadWith({ latest, live })
    const user = { id: 3, role: 'author' } as never

    await findUnpublishedWork(payload, { now: NOW, user })

    for (const [args] of find.mock.calls) {
      expect(args).toMatchObject({ overrideAccess: false, user })
      expect(Object.keys((args as { select: object }).select)).not.toContain(
        'content',
      )
    }
  })

  it('makes one read when nothing is waiting', async () => {
    const { payload, find } = payloadWith({ latest: [], live: [] })

    const work = await findUnpublishedWork(payload, { now: NOW })

    expect(find).toHaveBeenCalledTimes(1)
    expect(work).toEqual({
      liveWithChanges: [],
      scheduledWithChanges: [],
      draftsPastTheirDate: [],
    })
  })
})

describe('EditorialDashboard', () => {
  async function render(payload: Payload) {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    try {
      return renderToStaticMarkup(await EditorialDashboard({ payload }))
    } finally {
      vi.useRealTimers()
    }
  }

  it('names live articles carrying an edit nobody published', async () => {
    const { payload } = payloadWith({ latest, live })
    ;(payload as unknown as { count: unknown }).count = vi.fn(async () => ({
      totalDocs: 0,
    }))

    const html = await render(payload)

    expect(html).toContain('live, with changes nobody published')
    expect(html).toContain('drafts past their date')
    expect(html).toContain('scheduled, with changes nobody published')
    // Each row opens the list already filtered to exactly those posts.
    expect(html).toContain(
      `href="/admin/collections/posts?${new URLSearchParams({
        'where[id][in][0]': '186',
      }).toString()}"`,
    )
  })

  // The first screen after login. A failed read is an absent row.
  it('still renders when the read fails', async () => {
    const payload = {
      find: vi.fn(async () => {
        throw new Error('database unavailable')
      }),
      count: vi.fn(async () => ({ totalDocs: 0 })),
    } as unknown as Payload

    const html = await render(payload)

    expect(html).toContain('Nothing is waiting')
  })
})
