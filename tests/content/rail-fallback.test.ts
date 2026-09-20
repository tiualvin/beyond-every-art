import { describe, expect, it } from 'vitest'

import { RAIL_PROMO_MAX, toRailFallback } from '../../lib/content/queries'

const doc = (over: Record<string, unknown> = {}) => ({
  _status: 'published',
  slug: 'ultramarine-science',
  title: 'Why Ultramarine Was Worth More Than Gold',
  tags: [{ name: 'materials', slug: 'materials' }],
  excerpt: 'a '.repeat(150),
  ...over,
})

const posts = (...list: Record<string, unknown>[]) => ({
  kind: 'post',
  posts: list,
})

const app = (over: Record<string, unknown> = {}) => ({
  kind: 'app',
  app: {
    _status: 'published',
    slug: 'dapple',
    name: 'Dapple',
    tagline: 'Colour, on your phone.',
    ...over,
  },
})

/** Narrows the union so a test can reach the list without a cast per line. */
const promoted = (value: unknown) => {
  const result = toRailFallback(value)
  expect(result?.kind).toBe('post')
  return result && result.kind === 'post' ? result.posts : []
}

describe('toRailFallback', () => {
  it('resolves published posts to headlines and links, in order', () => {
    const list = promoted(
      posts(doc(), doc({ slug: 'second', title: 'Second' })),
    )

    expect(list).toHaveLength(2)
    expect(list[0]).toMatchObject({
      title: 'Why Ultramarine Was Worth More Than Gold',
      href: '/ultramarine-science/',
    })
    expect(list[0].meta).toContain('materials')
    expect(list[1].href).toBe('/second/')
  })

  it('resolves a published app to its name and tagline', () => {
    expect(toRailFallback(app())).toEqual({
      kind: 'app',
      name: 'Dapple',
      tagline: 'Colour, on your phone.',
      href: '/apps/dapple/',
    })
  })

  // The box is 250px and an item is about 60px. A fourth would either overflow
  // or force every item smaller than it reads at, and `maxRows` in the admin
  // is a nicety rather than a guarantee — nothing stops a fourth row arriving
  // from a direct database edit or an older document.
  it('never promotes more than the box holds', () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      doc({ slug: `p${i}`, title: `Post ${i}` }),
    )

    expect(promoted(posts(...many))).toHaveLength(RAIL_PROMO_MAX)
  })

  // The admin will happily let an editor point at a draft, and a reader
  // following that link gets a 404. Filtering here rather than in the form is
  // what stays correct when a post is unpublished *after* being chosen, which
  // no form validation could catch.
  it('drops a draft and keeps the rest', () => {
    const list = promoted(
      posts(doc({ _status: 'draft' }), doc({ slug: 'live', title: 'Live' })),
    )

    expect(list).toHaveLength(1)
    expect(list[0].href).toBe('/live/')
  })

  it('shows nothing when every choice was a draft', () => {
    expect(toRailFallback(posts(doc({ _status: 'draft' })))).toBeNull()
    expect(toRailFallback(app({ _status: 'draft' }))).toBeNull()
  })

  // A members-only post is listed, searched and syndicated like any other on
  // this site; the rail is not the one place it gets hidden.
  it('promotes a members-only post, like every other surface does', () => {
    expect(promoted(posts(doc({ visibility: 'members' })))).toHaveLength(1)
  })

  it('shows nothing when the editor chose nothing', () => {
    expect(toRailFallback(undefined)).toBeNull()
    expect(toRailFallback({})).toBeNull()
    expect(toRailFallback({ kind: 'none' })).toBeNull()
    expect(toRailFallback({ kind: 'post' })).toBeNull()
    expect(toRailFallback(posts())).toBeNull()
  })

  // The join table cascades on delete, so removing a promoted post takes the
  // row with it. The kind is left behind, pointing at an empty list.
  it('survives a promoted document being deleted', () => {
    expect(toRailFallback({ kind: 'post', posts: [] })).toBeNull()
    expect(toRailFallback({ kind: 'app', app: null })).toBeNull()
  })

  // `depth: 1` is what resolves these to documents. If it ever goes back to 0
  // they arrive as bare ids, and a renderer handed `3` would put an empty
  // headline over a link to nowhere.
  it('shows nothing for a relationship that came back unresolved', () => {
    expect(toRailFallback({ kind: 'post', posts: [3, 7] })).toBeNull()
    expect(toRailFallback({ kind: 'app', app: '7' })).toBeNull()
  })

  // Neither is reachable through the admin; both are one direct database edit
  // or one bad migration away.
  it('drops a document missing the parts it needs', () => {
    expect(toRailFallback(posts(doc({ slug: '' })))).toBeNull()
    expect(toRailFallback(posts(doc({ title: undefined })))).toBeNull()
    expect(toRailFallback(app({ slug: undefined }))).toBeNull()
    expect(toRailFallback(app({ name: '' }))).toBeNull()
  })

  // Both are used only by the single-pick layout, which fills the box with a
  // picture where the post has one and with its standfirst where it does not.
  it('carries the excerpt and the image a featured pick needs', () => {
    const [only] = promoted(
      posts(
        doc({
          featuredImage: { url: '/m/x.jpg', alt: 'x', width: 1, height: 1 },
        }),
      ),
    )

    expect(only.excerpt).not.toBe('')
    expect(only.image?.url).toBe('/m/x.jpg')
  })

  it('leaves the image null when the post has none', () => {
    expect(promoted(posts(doc()))[0].image).toBeNull()
  })

  // The kind decides, not which relationship happens to be filled: an editor
  // who set articles, then switched to apps and picked one, has both populated
  // and means the second.
  it('follows the kind when both relationships are set', () => {
    const both = { ...posts(doc()), ...app() }

    expect(toRailFallback({ ...both, kind: 'app' })).toMatchObject({
      kind: 'app',
    })
    expect(toRailFallback({ ...both, kind: 'post' })).toMatchObject({
      kind: 'post',
    })
  })
})
