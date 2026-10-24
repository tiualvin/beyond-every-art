import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { READ_NEXT_COUNT, RELATED_QUERY_LIMIT } from '../../lib/content/related'
import {
  auditRelated,
  legacyRelated,
  narrowTags,
  sameTopic,
  type AuditPost,
} from '../../lib/content/related-audit'
import {
  foldWord,
  pairSeed,
  rankRelated,
  RELATED_WEIGHTS,
  scoreRelated,
  termsOf,
  type RelatedCandidate,
} from '../../lib/content/related-rank'

const NOW = new Date('2026-10-24T12:00:00Z')

function post(
  slug: string,
  title: string,
  tags: string[],
  publishedAt: string,
): RelatedCandidate {
  return { slug, title, tags, publishedAt }
}

/** A small archive shaped like the real one: one broad tag on most of it. */
const ARCHIVE: RelatedCandidate[] = [
  post(
    'gouache-reactivates-water-acrylic-doesnt',
    "Why Gouache Reactivates With Water While Acrylic Doesn't",
    ['art', 'palette'],
    '2026-02-18T10:00:00Z',
  ),
  post(
    'why-acrylic-dries-darker',
    'Why Acrylic Paint Dries Darker',
    ['materials-science'],
    '2026-10-19T16:00:00Z',
  ),
  post(
    'bronze-casting-from-wax-to-patina',
    'Bronze Casting: From Wax to Patina',
    ['art', 'studio-insider'],
    '2026-10-23T22:00:00Z',
  ),
  post(
    'how-long-does-a-sculpture-last',
    'How Long Does a Sculpture Actually Last?',
    ['art', 'studio-insider'],
    '2026-10-23T19:00:00Z',
  ),
  post(
    'outdoor-sculpture-material-durability',
    'What Actually Survives Outside: Material Realities of Outdoor Sculpture',
    ['art'],
    '2026-01-31T03:47:46Z',
  ),
  post(
    'purple-color-history',
    'Purple Was the Most Expensive Color for Thousands of Years',
    ['palette'],
    '2025-10-31T03:26:11Z',
  ),
  post(
    'most-expensive-colors-in-history',
    'The Most Expensive Colors in History (and Why They Cost a Fortune)',
    ['palette'],
    '2025-12-14T05:41:08Z',
  ),
  post(
    'why-small-galleries-matter-more-than-museums',
    'Why Small Galleries Matter More Than Museums',
    ['exhibitions', 'art'],
    '2026-10-01T16:00:00Z',
  ),
  post(
    'commission-pricing-formula-emerging-artists',
    'The Commission Pricing Formula Every Emerging Artist Needs',
    ['studio-notes'],
    '2025-11-08T07:21:33Z',
  ),
  post(
    'how-to-price-art-prints',
    'How to Price Art Prints (Not Originals)',
    ['studio-notes'],
    '2026-10-06T16:00:00Z',
  ),
  post(
    'varnishing-oil-paintings-without-yellowing-or-blooming',
    'Varnishing Oil Paintings Without Yellowing or Blooming',
    ['art'],
    '2026-02-17T10:00:52Z',
  ),
  post(
    'the-quiet-power-of-negative-space',
    'The Quiet Power of Negative Space',
    ['art'],
    '2026-10-09T16:00:00Z',
  ),
]

const slugs = (list: RelatedCandidate[]) => list.map((item) => item.slug)

describe('words a title is matched on', () => {
  it('folds plurals, and -ing only where a silent e went missing', () => {
    expect(foldWord('galleries')).toBe(foldWord('gallery'))
    expect(foldWord('pigments')).toBe(foldWord('pigment'))
    expect(foldWord('pricing')).toBe(foldWord('price'))
    expect(foldWord('carving')).toBe(foldWord('carve'))
    expect(foldWord('smudges')).toBe(foldWord('smudge'))
    // A varnish defect is not the colour, and a technique is not a material.
    expect(foldWord('yellowing')).not.toBe(foldWord('yellow'))
    expect(foldWord('painting')).not.toBe(foldWord('paint'))
    expect(foldWord('glass')).toBe('glass')
  })

  it('drops function words, headline verbs and the words every article shares', () => {
    expect([
      ...termsOf(
        'yellow-color-meaning',
        'Yellow Is the Most Difficult Color and Most Artists Get It Wrong',
      ),
    ]).toEqual([foldWord('yellow'), foldWord('color')])
    // The slug is read too: it is where the search terms are when the
    // headline is a hook.
    expect(
      termsOf(
        'sfumato-leonardo-technique-explained',
        'The Technique With No Edges',
      ),
    ).toEqual(
      new Set(['technique', 'edg', 'sfumato', 'leonardo'].map(foldWord)),
    )
  })

  it('keeps a year and drops a bare number', () => {
    const terms = termsOf('holbein-1533', 'The 2 Skulls of 1533')
    expect(terms.has('1533')).toBe(true)
    expect(terms.has('2')).toBe(false)
  })
})

describe('relevance', () => {
  it('ranks a rare shared word above an identical set of broad tags', () => {
    const ranked = slugs(
      rankRelated(
        {
          slug: 'gouache-reactivates-water-acrylic-doesnt',
          tags: ['art', 'palette'],
        },
        ARCHIVE,
        3,
        NOW,
      ),
    )
    // Shares "acrylic" and no tag at all, and still leads.
    expect(ranked[0]).toBe('why-acrylic-dries-darker')
  })

  it('weights a narrow tag above a broad one', () => {
    const scored = scoreRelated(
      {
        slug: 'why-small-galleries-matter-more-than-museums',
        tags: ['exhibitions', 'art'],
      },
      [
        ...ARCHIVE,
        post('narrow', 'Zzz', ['exhibitions'], '2025-01-01T00:00:00Z'),
        post('broad', 'Yyy', ['art'], '2025-01-01T00:00:00Z'),
      ],
      NOW,
    )
    const tags = (slug: string) =>
      scored.find((s) => s.candidate.slug === slug)!.tags
    expect(tags('narrow')).toBeGreaterThan(tags('broad'))
  })

  it('treats a workflow tag as no subject at all', () => {
    const scored = scoreRelated(
      { slug: 'a', title: 'Aaa', tags: ['featured'] },
      [
        post('a', 'Aaa', ['featured'], '2025-01-01T00:00:00Z'),
        post('b', 'Bbb', ['featured'], '2025-01-01T00:00:00Z'),
      ],
      NOW,
    )
    expect(scored[0].relevance).toBe(0)
  })

  it('makes a two-year-old article as eligible as last week’s', () => {
    const ranked = slugs(
      rankRelated(
        { slug: 'purple-color-history', tags: ['palette'] },
        ARCHIVE,
        1,
        NOW,
      ),
    )
    expect(ranked).toEqual(['most-expensive-colors-in-history'])
  })

  it('matches "pricing" with "price"', () => {
    const ranked = slugs(
      rankRelated(
        {
          slug: 'commission-pricing-formula-emerging-artists',
          tags: ['studio-notes'],
        },
        ARCHIVE,
        1,
        NOW,
      ),
    )
    expect(ranked).toEqual(['how-to-price-art-prints'])
  })

  // The tiebreaks reorder near-ties and nothing else. Checked for many pages
  // rather than one, because the variety term is different on every page.
  it('never lets recency or variety promote an unrelated piece over a related one', () => {
    expect(RELATED_WEIGHTS.recency + RELATED_WEIGHTS.variety).toBeLessThan(0.1)
    for (let page = 0; page < 200; page += 1) {
      const archive = [
        post(
          `page-${page}`,
          'Why Acrylic Behaves',
          ['art'],
          '2025-01-01T00:00:00Z',
        ),
        // Old, and shares one rare word.
        post(
          'acrylic-film',
          'Acrylic Film Formation',
          ['studio-notes'],
          '2024-01-01T00:00:00Z',
        ),
        // Published today, and shares only the broad tag.
        post(
          'brand-new',
          'Something Else Entirely',
          ['art'],
          NOW.toISOString(),
        ),
        ...Array.from({ length: 6 }, (_, i) =>
          post(
            `filler-${i}`,
            `Filler Piece ${i}`,
            ['art'],
            '2025-06-01T00:00:00Z',
          ),
        ),
      ]
      const ranked = slugs(
        rankRelated({ slug: `page-${page}`, tags: ['art'] }, archive, 9, NOW),
      )
      expect(ranked.indexOf('acrylic-film')).toBeLessThan(
        ranked.indexOf('brand-new'),
      )
    }
  })

  it('never offers the page itself, and stops at the limit', () => {
    const ranked = slugs(
      rankRelated(
        { slug: 'purple-color-history', tags: ['palette'] },
        ARCHIVE,
        4,
        NOW,
      ),
    )
    expect(ranked).not.toContain('purple-color-history')
    expect(ranked).toHaveLength(4)
    expect(rankRelated({ slug: 'x', tags: [] }, ARCHIVE, 0, NOW)).toEqual([])
  })

  it('ranks a draft that is not live yet from its slug and tags', () => {
    const ranked = slugs(
      rankRelated(
        { slug: 'acrylic-glazing-basics', tags: [] },
        ARCHIVE,
        2,
        NOW,
      ),
    )
    expect(ranked).toContain('why-acrylic-dries-darker')
  })
})

describe('determinism and spread', () => {
  it('gives a page the same list every time, whatever order the candidates arrive in', () => {
    const subject = { slug: 'the-quiet-power-of-negative-space', tags: ['art'] }
    const first = slugs(rankRelated(subject, ARCHIVE, 9, NOW))
    expect(slugs(rankRelated(subject, ARCHIVE, 9, NOW))).toEqual(first)
    expect(slugs(rankRelated(subject, [...ARCHIVE].reverse(), 9, NOW))).toEqual(
      first,
    )
  })

  it('seeds on both slugs, in [0, 1)', () => {
    expect(pairSeed('a', 'b')).toBe(pairSeed('a', 'b'))
    expect(pairSeed('a', 'b')).not.toBe(pairSeed('b', 'a'))
    for (const [a, b] of [
      ['', ''],
      ['x', 'y'],
      ['purple-color-history', 'z'],
    ]) {
      expect(pairSeed(a, b)).toBeGreaterThanOrEqual(0)
      expect(pairSeed(a, b)).toBeLessThan(1)
    }
  })

  // Forty articles that share nothing but the "Art" tag: exactly the case the
  // old query handed the same three newest posts to every page.
  it('spreads equally related candidates across pages instead of repeating the newest', () => {
    const archive = Array.from({ length: 40 }, (_, i) =>
      post(
        `piece-${i}`,
        // One made-up word each, all the same length, so no title shares a
        // word with another and none is shorter than the rest — cosine would
        // rightly favour a shorter title, which is not what this measures.
        `Zq${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`,
        ['art'],
        new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
      ),
    )
    const counts = new Map<string, number>()
    for (const page of archive) {
      for (const pick of rankRelated(page, archive, READ_NEXT_COUNT, NOW)) {
        counts.set(pick.slug, (counts.get(pick.slug) ?? 0) + 1)
      }
    }
    // 120 slots over 39 candidates each: about three apiece if spread evenly.
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(10)
    expect(counts.size).toBeGreaterThan(25)
    // And the old outcome, for contrast, from the same archive.
    const legacy = new Map<string, number>()
    for (const page of archive) {
      for (const pick of legacyRelated(page, archive, READ_NEXT_COUNT)) {
        legacy.set(pick.slug, (legacy.get(pick.slug) ?? 0) + 1)
      }
    }
    expect(legacy.size).toBe(4)
  })
})

describe('the audit', () => {
  const audit = (posts: AuditPost[]) =>
    auditRelated(
      posts,
      (subject, candidates, limit) =>
        rankRelated(subject, candidates, limit, NOW),
      {
        readNextCount: READ_NEXT_COUNT,
        poolSize: RELATED_QUERY_LIMIT,
      },
    )

  it('reproduces the old query: tag matches newest first, then the newest', () => {
    const picked = slugs(
      legacyRelated(
        { slug: 'purple-color-history', tags: ['palette'] },
        ARCHIVE,
        3,
      ),
    )
    expect(picked).toEqual([
      'gouache-reactivates-water-acrylic-doesnt',
      'most-expensive-colors-in-history',
      // Topped up with the newest post on the site, which shares nothing.
      'bronze-casting-from-wax-to-patina',
    ])
  })

  it('calls two posts same-topic on a shared word or a narrow tag, not on "Art"', () => {
    const archive = ARCHIVE.map((item) => ({ ...item, migrated: false }))
    const narrow = narrowTags(archive)
    expect(narrow.has('art')).toBe(false)
    const find = (slug: string) => archive.find((item) => item.slug === slug)!
    expect(
      sameTopic(
        find('purple-color-history'),
        find('most-expensive-colors-in-history'),
        narrow,
      ),
    ).toBe(true)
    expect(
      sameTopic(
        find('the-quiet-power-of-negative-space'),
        find('bronze-casting-from-wax-to-patina'),
        narrow,
      ),
    ).toBe(false)
  })

  it('counts pages, targets and migrated articles', () => {
    const archive = ARCHIVE.map((item, index) => ({
      ...item,
      migrated: index % 2 === 0,
    }))
    const result = audit(archive)
    expect(result.pages).toBe(ARCHIVE.length)
    expect(result.migratedTotal).toBe(6)
    expect(result.readNextTargets).toBeGreaterThan(3)
    expect(result.maxShare).toBeGreaterThan(0)
    expect(result.maxShare).toBeLessThanOrEqual(1)
  })
})

// The whole live archive on 24 Oct 2026, so the targets the change was made
// for are held on the data they were measured on rather than on a toy.
describe('on the live archive as it stood on 24 Oct 2026', () => {
  const fixture = JSON.parse(
    readFileSync(
      join(process.cwd(), 'tests/fixtures/related/live-posts-2026-10-24.json'),
      'utf8',
    ),
  ) as { posts: AuditPost[] }
  const posts = fixture.posts
  const options = {
    readNextCount: READ_NEXT_COUNT,
    poolSize: RELATED_QUERY_LIMIT,
  }
  const after = auditRelated(
    posts,
    (subject, candidates, limit) =>
      rankRelated(subject, candidates, limit, NOW),
    options,
  )

  it('is the archive the October measurements were taken on', () => {
    expect(posts).toHaveLength(161)
    expect(posts.filter((p) => p.migrated)).toHaveLength(113)
    const before = auditRelated(
      posts,
      (s, c, l) => legacyRelated(s, c, l),
      options,
    )
    // What the crawl found, reproduced: 25 targets, six migrated articles.
    expect(before.readNextTargets).toBe(25)
    expect(before.migratedInReadNext).toBe(6)
    expect(before.maxShare).toBeGreaterThan(0.6)
  })

  it('puts no post in more than about a tenth of "Read next" rows', () => {
    expect(after.maxShare).toBeLessThanOrEqual(0.1)
  })

  it('gives most pages at least two same-topic pieces', () => {
    expect(after.pagesWithTwoSameTopic / after.pages).toBeGreaterThan(0.75)
  })

  it('links to dozens of migrated articles', () => {
    expect(after.migratedInReadNext).toBeGreaterThanOrEqual(60)
    expect(after.migratedInPool).toBeGreaterThanOrEqual(90)
  })

  it('leads the four pilot pages with pieces on their subject', () => {
    const lead = (slug: string) =>
      slugs(
        rankRelated(
          { slug, tags: posts.find((p) => p.slug === slug)!.tags },
          posts,
          3,
          NOW,
        ),
      )
    expect(lead('purple-color-history')[0]).toBe(
      'most-expensive-colors-in-history',
    )
    expect(lead('most-expensive-colors-in-history')[0]).toBe(
      'purple-color-history',
    )
    expect(
      lead('gouache-reactivates-water-acrylic-doesnt').slice(0, 2).sort(),
    ).toEqual([
      'why-acrylic-dries-darker',
      'why-watercolor-lifts-and-acrylic-doesnt',
    ])
    expect(lead('commission-pricing-formula-emerging-artists')[0]).toBe(
      'how-to-price-art-prints',
    )
  })
})
