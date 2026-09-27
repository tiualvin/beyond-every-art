import { describe, expect, it } from 'vitest'

import {
  parseTagPlan,
  planTagChanges,
  remainingReferences,
  retiredArchivePaths,
  type PlanPost,
  type PlanRedirect,
  type PlanTag,
  type TagPlan,
} from '../../lib/content/tag-plan'

// Ids and slugs as they are in production on 22 Sep, so the pigment
// expectations below are the real ones.
const TAGS: PlanTag[] = [
  { id: 1, slug: 'news', name: 'News' },
  { id: 2, slug: 'featured', name: 'Featured' },
  { id: 3, slug: 'palette', name: 'Palette' },
  { id: 4, slug: 'studio-notes', name: 'Studio Notes' },
  { id: 5, slug: 'exhibitions', name: 'Exhibitions' },
  { id: 6, slug: 'studio-insider', name: 'Studio Insider' },
  { id: 7, slug: 'art', name: 'Art' },
  { id: 8, slug: 'music', name: 'Music' },
  { id: 9, slug: 'materials-science', name: 'materials-science' },
  {
    id: 10,
    slug: 'science-of-art-materials',
    name: 'Science of Art Materials',
  },
]

function post(
  id: number,
  slug: string,
  tagIds: number[],
  status: 'published' | 'draft' = 'published',
): PlanPost {
  return {
    id,
    slug,
    published: { status, tagIds },
    latest: { status, tagIds },
  }
}

function plan(
  shape: TagPlan,
  posts: PlanPost[],
  redirects: PlanRedirect[] = [],
  tags: PlanTag[] = TAGS,
) {
  return planTagChanges({ plan: shape, tags, posts, redirects })
}

const MERGE: TagPlan = {
  merge: [{ from: 'materials-science', into: 'science-of-art-materials' }],
}

describe('merging a tag into another', () => {
  it('swaps it where it stood, so the card label does not move', () => {
    const result = plan(MERGE, [post(110, 'burnt-sienna', [9, 3])])

    expect(result.posts).toEqual([
      expect.objectContaining({
        slug: 'burnt-sienna',
        before: ['materials-science', 'palette'],
        after: ['science-of-art-materials', 'palette'],
        afterIds: [10, 3],
        status: 'published',
      }),
    ])
  })

  it('redirects the merged archive to the surviving one', () => {
    const result = plan(MERGE, [post(110, 'burnt-sienna', [9])])

    expect(result.redirects).toEqual([
      {
        action: 'create',
        source: '/tag/materials-science/',
        destination: '/tag/science-of-art-materials/',
      },
    ])
    expect(result.deletable).toEqual([{ id: 9, slug: 'materials-science' }])
  })

  it('does not list the survivor twice on a post that had both', () => {
    const result = plan(MERGE, [post(1, 'both', [10, 9, 3])])

    expect(result.posts[0]?.after).toEqual([
      'science-of-art-materials',
      'palette',
    ])
  })

  it('keeps a draft a draft', () => {
    const result = plan(MERGE, [
      post(119, 'what-ultramarine-cost', [9, 3], 'draft'),
    ])

    expect(result.posts[0]?.status).toBe('draft')
  })

  it('moves only the swatch the merge unblocks', () => {
    // The live subject set. `materials-science` sorts first and took Lead
    // White, pushing its twin on to Burnt Sienna; with it gone, the survivor
    // gets its own hashed colour back. Nothing else moves.
    const live = [
      post(1, 'a', [7]),
      post(2, 'b', [3]),
      post(3, 'c', [4]),
      post(4, 'd', [5]),
      post(5, 'e', [8]),
      post(6, 'f', [6]),
      post(7, 'g', [10]),
      post(8, 'h', [9]),
    ]

    expect(plan(MERGE, live).pigments).toEqual([
      {
        slug: 'science-of-art-materials',
        from: 'Burnt Sienna',
        to: 'Lead White',
      },
    ])
  })
})

describe('retiring a tag', () => {
  const RETIRE_ART: TagPlan = {
    retire: [{ slug: 'art', redirectTo: '/journal/' }],
  }

  it('drops it in place, so the next tag becomes the card label', () => {
    const result = plan(RETIRE_ART, [post(85, 'red', [7, 3, 4])])

    expect(result.posts[0]).toMatchObject({
      before: ['art', 'palette', 'studio-notes'],
      after: ['palette', 'studio-notes'],
    })
    expect(result.redirects).toEqual([
      { action: 'create', source: '/tag/art/', destination: '/journal/' },
    ])
  })

  it('is blocked, whole, while any post would be left without a subject', () => {
    const result = plan(RETIRE_ART, [
      post(54, 'art-only', [7]),
      post(85, 'red', [7, 3]),
    ])

    expect(result.conflicts).toEqual([
      expect.objectContaining({
        kind: 'no_subject_left',
        post: 'art-only',
        blocks: ['art'],
      }),
    ])
    expect(result.blocked).toEqual(['art'])
    // Not half-done: the post that could have moved does not, the archive
    // does not redirect, and the tag is not deleted.
    expect(result.posts).toEqual([])
    expect(result.redirects).toEqual([])
    expect(result.deletable).toEqual([])
  })

  it('goes ahead once the plan says where that post belongs', () => {
    const result = plan(
      { ...RETIRE_ART, assign: { 'art-only': ['science-of-art-materials'] } },
      [post(54, 'art-only', [7]), post(85, 'red', [7, 3])],
    )

    expect(result.conflicts).toEqual([])
    expect(result.posts.map((change) => [change.slug, change.after])).toEqual([
      ['art-only', ['science-of-art-materials']],
      ['red', ['palette']],
    ])
  })

  it('counts a workflow tag as no subject at all', () => {
    // `featured` is a placement, not a subject: a post carrying only it has
    // no subject today, and retiring it would leave the post with nothing.
    const result = plan(
      { retire: [{ slug: 'featured', redirectTo: '/journal/' }] },
      [post(1, 'fine-art-home-guide', [2])],
    )

    expect(result.blocked).toEqual(['featured'])
  })

  it('redirects an archive nothing is filed under', () => {
    const result = plan(
      { retire: [{ slug: 'news', redirectTo: '/journal/' }] },
      [post(2, 'untouched', [3])],
    )

    expect(result.posts).toEqual([])
    expect(result.redirects).toEqual([
      { action: 'create', source: '/tag/news/', destination: '/journal/' },
    ])
    expect(result.deletable).toEqual([{ id: 1, slug: 'news' }])
  })

  it('covers the pagination pages Ghost served, so none is two hops', () => {
    expect(retiredArchivePaths('art', 3)).toEqual([
      '/tag/art/',
      '/tag/art/page/2/',
      '/tag/art/page/3/',
    ])
    const result = plan(
      { retire: [{ slug: 'art', redirectTo: '/journal/', ghostPages: 3 }] },
      [post(85, 'red', [7, 3])],
    )

    expect(result.redirects.map((change) => change.source)).toEqual([
      '/tag/art/',
      '/tag/art/page/2/',
      '/tag/art/page/3/',
    ])
  })
})

describe('what the plan will not do', () => {
  it('leaves a published post with unpublished changes to an editor', () => {
    // Its latest version is a draft, and an update carries that status: it
    // would take the article off the site.
    const pending: PlanPost = {
      id: 85,
      slug: 'red',
      published: { status: 'published', tagIds: [9, 3] },
      latest: { status: 'draft', tagIds: [9, 3, 4] },
    }
    const result = plan(MERGE, [pending])

    expect(result.conflicts).toEqual([
      expect.objectContaining({
        kind: 'pending_draft',
        post: 'red',
        blocks: ['materials-science'],
      }),
    ])
    expect(result.posts).toEqual([])
  })

  it('never overwrites a redirect someone already set', () => {
    const result = plan(
      MERGE,
      [post(110, 'burnt-sienna', [9])],
      [
        {
          id: 1,
          source: '/tag/materials-science/',
          destination: '/elsewhere/',
          statusCode: '301',
          enabled: true,
        },
      ],
    )

    expect(result.conflicts).toEqual([
      expect.objectContaining({
        kind: 'redirect_clash',
        source: '/tag/materials-science/',
      }),
    ])
    expect(result.blocked).toEqual(['materials-science'])
  })

  it('re-aims a redirect that pointed at a retired archive', () => {
    const result = plan(
      { retire: [{ slug: 'art', redirectTo: '/journal/' }] },
      [post(85, 'red', [7, 3])],
      [
        {
          id: 4,
          source: '/old-art/',
          destination: '/tag/art',
          statusCode: '301',
        },
      ],
    )

    expect(result.redirects).toContainEqual({
      action: 'retarget',
      id: 4,
      source: '/old-art/',
      from: '/tag/art',
      destination: '/journal/',
    })
  })

  it.each([
    [
      'a merge target that is itself retiring',
      {
        merge: [{ from: 'music', into: 'art' }],
        retire: [{ slug: 'art', redirectTo: '/journal/' }],
      },
      'is itself being retired',
    ],
    [
      'a destination that costs a second hop',
      { retire: [{ slug: 'news', redirectTo: '/journal' }] },
      'not a site path ending in a slash',
    ],
    [
      'an off-site destination',
      { retire: [{ slug: 'news', redirectTo: 'https://example.com/' }] },
      'not a site path ending in a slash',
    ],
    [
      'a destination that is another retiring archive',
      {
        retire: [
          { slug: 'news', redirectTo: '/tag/featured/' },
          { slug: 'featured', redirectTo: '/journal/' },
        ],
      },
      'also being retired',
    ],
    [
      'the same tag retired twice',
      {
        retire: [
          { slug: 'news', redirectTo: '/journal/' },
          { slug: 'news', redirectTo: '/journal/' },
        ],
      },
      'more than once',
    ],
    [
      'a merge into a tag that does not exist',
      { merge: [{ from: 'music', into: 'sound' }] },
      'is not a tag',
    ],
    [
      'an assignment to a retiring tag',
      {
        retire: [{ slug: 'art', redirectTo: '/journal/' }],
        assign: { red: ['art'] },
      },
      'which is being retired',
    ],
    [
      'an assignment with no subject in it',
      { assign: { red: ['featured'] } },
      'no subject tag',
    ],
    [
      'an assignment to a post that does not exist',
      { assign: { missing: ['palette'] } },
      'does not exist',
    ],
    [
      'a pagination count that is not a count',
      { retire: [{ slug: 'art', redirectTo: '/journal/', ghostPages: 0 }] },
      'ghostPages',
    ],
  ] as [string, TagPlan, string][])('refuses %s', (_, shape, message) => {
    const result = plan(shape, [post(85, 'red', [7, 3])])

    expect(result.errors.join('\n')).toContain(message)
    expect(result.posts).toEqual([])
    expect(result.redirects).toEqual([])
  })
})

describe('running it again', () => {
  it('finds nothing left to do once it has been applied', () => {
    const shape: TagPlan = {
      ...MERGE,
      retire: [{ slug: 'news', redirectTo: '/journal/' }],
    }
    const first = plan(shape, [post(110, 'burnt-sienna', [9, 3])])

    // The world after the first run: posts rewritten, rows created, tags gone.
    const applied = [
      post(110, 'burnt-sienna', first.posts[0]!.afterIds as number[]),
    ]
    const rows = first.redirects.map((change, index) => ({
      id: index + 1,
      source: change.source,
      destination: change.destination,
      statusCode: '301',
      enabled: true,
    }))
    const remaining = TAGS.filter(
      (tag) => !first.deletable.some((gone) => gone.id === tag.id),
    )
    const second = plan(shape, applied, rows, remaining)

    expect(second.errors).toEqual([])
    expect(second.posts).toEqual([])
    expect(second.redirects).toEqual([])
    expect(second.redirectsInPlace).toEqual([
      '/tag/materials-science/',
      '/tag/news/',
    ])
    expect(second.deletable).toEqual([])
  })
})

describe('the numbers it reports', () => {
  it('counts published posts per tag and those with no subject, before and after', () => {
    const result = plan(
      {
        retire: [{ slug: 'art', redirectTo: '/journal/' }],
        assign: { 'art-only': ['palette'] },
      },
      [
        post(1, 'art-only', [7]),
        post(2, 'red', [7, 3]),
        post(3, 'untagged', []),
        post(4, 'a-draft', [7, 3], 'draft'),
      ],
    )

    expect(result.counts.before).toEqual({ art: 2, palette: 1 })
    expect(result.counts.after).toEqual({ palette: 2 })
    expect(result.counts.publishedWithoutSubject).toEqual({
      before: 1,
      after: 1,
    })
  })
})

describe('remainingReferences', () => {
  it('finds a tag in either view of a post', () => {
    const pending: PlanPost = {
      id: 1,
      slug: 'red',
      published: { status: 'published', tagIds: [3] },
      latest: { status: 'draft', tagIds: [3, 7] },
    }

    expect(remainingReferences([pending], TAGS, new Set(['art']))).toEqual([
      { post: 'red', tag: 'art', view: 'latest' },
    ])
  })
})

describe('parseTagPlan', () => {
  it('accepts a plan in the committed shape', () => {
    const shape = {
      $comment: 'Why, for the reviewer.',
      merge: [{ from: 'materials-science', into: 'science-of-art-materials' }],
      retire: [{ slug: 'news', redirectTo: '/journal/', ghostPages: 1 }],
      assign: { 'fine-art-home-guide': ['palette'] },
    }

    expect(parseTagPlan(shape)).toEqual(shape)
  })

  it('refuses a misspelt key rather than reading it as an empty plan', () => {
    expect(() =>
      parseTagPlan({ retired: [{ slug: 'news', redirectTo: '/journal/' }] }),
    ).toThrow('unknown key "retired"')
  })

  it('refuses entries missing what they need', () => {
    expect(() => parseTagPlan({ retire: [{ slug: 'news' }] })).toThrow(
      '"redirectTo"',
    )
    expect(() => parseTagPlan({ merge: [{ from: 'a', to: 'b' }] })).toThrow()
    expect(() => parseTagPlan({ assign: { post: 'palette' } })).toThrow(
      'lists of tag slugs',
    )
    expect(() => parseTagPlan([])).toThrow('JSON object')
  })
})
