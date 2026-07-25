import { describe, expect, it } from 'vitest'

import {
  isClean,
  validateContent,
  validateRefs,
  type ActualContent,
  type ExpectedContent,
} from '../../lib/migration/validate'

const expected: ExpectedContent[] = [
  {
    ghostID: 'g1',
    slug: 'hello-world',
    status: 'published',
    hasFeatureImage: true,
    publishedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    ghostID: 'g2',
    slug: 'draft-post',
    status: 'draft',
    hasFeatureImage: false,
  },
]

describe('validateContent', () => {
  it('reports no issues for a faithful import', () => {
    const actual: ActualContent[] = [
      {
        ghostID: 'g1',
        slug: 'hello-world',
        status: 'published',
        hasFeatureImage: true,
        // Same instant, different string format — must be treated as equal.
        publishedAt: '2024-01-01T00:00:00Z',
      },
      {
        ghostID: 'g2',
        slug: 'draft-post',
        status: 'draft',
        hasFeatureImage: false,
      },
    ]
    const report = validateContent(expected, actual)
    expect(report.matched).toBe(2)
    expect(report.issues).toEqual([])
  })

  it('flags a missing post', () => {
    const report = validateContent(expected, [
      {
        ghostID: 'g1',
        slug: 'hello-world',
        status: 'published',
        hasFeatureImage: true,
        publishedAt: '2024-01-01T00:00:00.000Z',
      },
    ])
    expect(report.issues).toEqual([
      {
        ghostID: 'g2',
        slug: 'draft-post',
        field: 'missing',
        expected: 'draft-post',
        actual: null,
      },
    ])
  })

  it('flags status drift, slug change, lost image, and date change', () => {
    const actual: ActualContent[] = [
      {
        ghostID: 'g1',
        slug: 'hello-world-renamed',
        status: 'draft',
        hasFeatureImage: false,
        publishedAt: '2024-02-02T00:00:00.000Z',
      },
      {
        ghostID: 'g2',
        slug: 'draft-post',
        status: 'draft',
        hasFeatureImage: false,
      },
    ]
    const fields = validateContent(expected, actual)
      .issues.filter((i) => i.ghostID === 'g1')
      .map((i) => i.field)
      .sort()
    expect(fields).toEqual(['featureImage', 'publishedAt', 'slug', 'status'])
  })

  it('does not flag a gained feature image', () => {
    const report = validateContent(
      [
        {
          ghostID: 'g2',
          slug: 'draft-post',
          status: 'draft',
          hasFeatureImage: false,
        },
      ],
      [
        {
          ghostID: 'g2',
          slug: 'draft-post',
          status: 'draft',
          hasFeatureImage: true,
        },
      ],
    )
    expect(report.issues).toEqual([])
  })
})

describe('validateRefs', () => {
  it('reports missing and renamed references', () => {
    const report = validateRefs(
      [
        { ghostID: 't1', slug: 'painting' },
        { ghostID: 't2', slug: 'sculpture' },
      ],
      [{ ghostID: 't1', slug: 'painting-renamed' }],
    )
    expect(report.issues).toEqual([
      {
        ghostID: 't1',
        slug: 'painting',
        field: 'slug',
        expected: 'painting',
        actual: 'painting-renamed',
      },
      {
        ghostID: 't2',
        slug: 'sculpture',
        field: 'missing',
        expected: 'sculpture',
        actual: null,
      },
    ])
  })
})

describe('isClean', () => {
  it('is true only when every report has no issues', () => {
    const good = validateRefs(
      [{ ghostID: 't1', slug: 'a' }],
      [{ ghostID: 't1', slug: 'a' }],
    )
    const bad = validateRefs([{ ghostID: 't2', slug: 'b' }], [])
    expect(isClean([good])).toBe(true)
    expect(isClean([good, bad])).toBe(false)
  })
})
