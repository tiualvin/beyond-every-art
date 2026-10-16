// The two reader additions the content API needs, against a fake Payload.
//
// `PostDetail` gains `featured` and `readingTime`, counted from the whole
// document like a listing card — so a gated post's reading time is the
// piece's, not its teaser's. And `getAuthorsWithCounts` lists the authors a
// reader can browse to: those with at least one live post.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { live } from '../../lib/content/schedule'

type FindArgs = { collection: string; limit?: number; where?: unknown }

const state: {
  posts: Record<string, unknown>[]
  authors: Record<string, unknown>[]
  counts: Map<number, number>
  /** Every `where` the authors index counted with, to check it asked for live posts. */
  countedWith: unknown[]
} = { posts: [], authors: [], counts: new Map(), countedWith: [] }

vi.mock('@/lib/payload', () => ({
  getPayloadClient: async () => ({
    find: async ({ collection, limit }: FindArgs) => {
      if (collection === 'posts' && limit === 1) return { docs: state.posts }
      if (collection === 'authors') return { docs: state.authors }
      // The withheld-slugs read: nothing is withheld here.
      return { docs: [] }
    },
    count: async ({
      where,
    }: {
      where: { and: [{ authors: { in: [number] } }] }
    }) => {
      state.countedWith.push(where)
      return { totalDocs: state.counts.get(where.and[0].authors.in[0]) ?? 0 }
    },
  }),
}))

// `unstable_cache` needs a Next.js request; the readers under it do not.
vi.mock('@/lib/cache/content', async (original) => ({
  ...(await original<typeof import('../../lib/cache/content')>()),
  cachedRead: (_name: string, read: (...args: unknown[]) => unknown) => read,
}))

const { getAuthorsWithCounts, getPostBySlug } =
  await import('../../lib/content/queries')

const NOW = new Date('2026-10-16T09:00:00.000Z')

beforeEach(() => {
  // Only the clock, so `live()` here and in the reader name the same moment.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  state.posts = []
  state.authors = []
  state.counts = new Map()
  state.countedWith = []
})

afterEach(() => {
  vi.useRealTimers()
})

describe('a post’s detail', () => {
  it('carries its featured flag and the whole piece’s reading time, even when gated', async () => {
    const paragraph = `<p>${'word '.repeat(330)}</p>`
    state.posts = [
      {
        slug: 'gated',
        title: 'Gated',
        featured: true,
        visibility: 'members',
        legacyHTML: paragraph + paragraph,
      },
    ]

    const post = await getPostBySlug('gated')

    expect(post?.featured).toBe(true)
    // 660 words at 220 a minute, though the teaser is half of that.
    expect(post?.readingTime).toBe(3)
    expect(post?.restricted).toBe(true)
  })

  it('reads an unflagged post as not featured', async () => {
    state.posts = [
      { slug: 'plain', title: 'Plain', legacyHTML: '<p>Short.</p>' },
    ]
    expect(await getPostBySlug('plain')).toMatchObject({
      featured: false,
      readingTime: 1,
    })
  })
})

describe('the authors index', () => {
  it('lists authors with live posts, most published first, then by name', async () => {
    state.authors = [
      { id: 1, name: 'Beatrix', slug: 'beatrix', bio: '  ' },
      { id: 2, name: 'Ada', slug: 'ada', bio: 'Writes about binders.' },
      { id: 3, name: 'Caro', slug: 'caro', bio: null },
      { id: 4, name: 'Drafts Only', slug: 'drafts-only' },
      { id: 5, name: '', slug: 'nameless' },
    ]
    state.counts = new Map([
      [1, 2],
      [2, 2],
      [3, 5],
      [4, 0],
      [5, 9],
    ])

    const authors = await getAuthorsWithCounts()

    // Counted against live posts only — published and due — so an author whose
    // only work is a draft or a scheduled piece is not listed, and nobody
    // learns how many unpublished posts somebody has. The nameless author is
    // passed over before anything is counted.
    expect(state.countedWith).toEqual(
      [1, 2, 3, 4].map((id) => ({
        and: [{ authors: { in: [id] } }, live(NOW)],
      })),
    )

    expect(authors).toEqual([
      { name: 'Caro', slug: 'caro', bio: null, image: null, postCount: 5 },
      {
        name: 'Ada',
        slug: 'ada',
        bio: 'Writes about binders.',
        image: null,
        postCount: 2,
      },
      {
        name: 'Beatrix',
        slug: 'beatrix',
        bio: null,
        image: null,
        postCount: 2,
      },
    ])
  })

  it('maps a portrait through the media normaliser', async () => {
    state.authors = [
      {
        id: 1,
        name: 'Ada',
        slug: 'ada',
        profileImage: {
          url: '/api/media/file/ada.jpg/',
          alt: 'Ada',
          width: 400,
          height: 400,
        },
      },
    ]
    state.counts = new Map([[1, 1]])
    const [ada] = await getAuthorsWithCounts()
    expect(ada?.image?.url).toBe('/api/media/file/ada.jpg')
  })
})
