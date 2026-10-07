import { describe, expect, it } from 'vitest'

import {
  groupContents,
  toContents,
  toPublicationCard,
  toPublicationDetail,
  type ContentsEntry,
} from '../../lib/publications/content'

const doc = {
  id: 7,
  slug: 'spring-2026',
  title: 'Spring 2026',
  subtitle: 'Pigments of the north',
  issueNumber: 'No. 3',
  series: 'Beyond Every Art Journal',
  description: 'An issue about blue.',
  cover: {
    url: '/api/media/file/cover.webp',
    alt: 'The cover, a field of ultramarine',
    width: 1600,
    height: 2400,
  },
  publishedAt: '2026-03-01T00:00:00.000Z',
  contents: [
    { section: 'Introduction', title: 'Editor’s note', page: 2 },
    { section: 'Materials', title: 'The alchemy of colour', page: 8 },
    { section: 'Materials', title: 'Titanium white', page: 18 },
  ],
  readingDirection: 'ltr',
  firstPageIsCover: true,
  metaTitle: 'Spring 2026 — Beyond Every Art',
  metaDescription: 'A whole issue about blue.',
  updatedAt: '2026-03-02T00:00:00.000Z',
}

describe('toPublicationCard', () => {
  it('maps the fields the archive shows', () => {
    const card = toPublicationCard(doc)!
    expect(card).toMatchObject({
      id: '7',
      slug: 'spring-2026',
      title: 'Spring 2026',
      issueNumber: 'No. 3',
      series: 'Beyond Every Art Journal',
      publishedAt: '2026-03-01T00:00:00.000Z',
    })
    expect(card.cover?.url).toBe('/api/media/file/cover.webp')
    expect(card.cover?.alt).toBe('The cover, a field of ultramarine')
  })

  it('has nothing to list without a slug or a title', () => {
    expect(toPublicationCard({ ...doc, slug: '' })).toBeNull()
    expect(toPublicationCard({ ...doc, title: '   ' })).toBeNull()
    expect(toPublicationCard(null)).toBeNull()
  })

  it('reads empty optional fields as empty rather than as undefined', () => {
    const card = toPublicationCard({ slug: 'x', title: 'X' })!
    expect(card).toMatchObject({
      subtitle: '',
      issueNumber: '',
      series: '',
      description: '',
      cover: null,
      publishedAt: null,
    })
  })

  it('treats a cover left as a bare id as no cover', () => {
    // A read at depth 0 returns the relationship unpopulated.
    expect(toPublicationCard({ ...doc, cover: 12 })!.cover).toBeNull()
  })
})

describe('toContents', () => {
  it('keeps the entries in issue order', () => {
    expect(toContents(doc.contents).map((entry) => entry.title)).toEqual([
      'Editor’s note',
      'The alchemy of colour',
      'Titanium white',
    ])
  })

  it('drops a row nobody filled in', () => {
    expect(
      toContents([{ section: 'Materials', title: '', page: 4 }, {}, null]),
    ).toEqual([])
  })

  it('keeps an entry with no page and no section', () => {
    expect(toContents([{ title: 'Colophon' }])).toEqual([
      { section: '', title: 'Colophon', page: null },
    ])
  })

  it('refuses a page number no issue has', () => {
    const pages = toContents([
      { title: 'a', page: 0 },
      { title: 'b', page: -3 },
      { title: 'c', page: 2.5 },
      { title: 'd', page: '12' },
      { title: 'e', page: 12 },
    ]).map((entry) => entry.page)
    expect(pages).toEqual([null, null, null, null, 12])
  })

  it('reads anything that is not a list as no contents', () => {
    expect(toContents(undefined)).toEqual([])
    expect(toContents('Materials')).toEqual([])
  })
})

describe('groupContents', () => {
  const entry = (section: string, title: string): ContentsEntry => ({
    section,
    title,
    page: null,
  })

  it('groups consecutive entries under their heading', () => {
    const grouped = groupContents(toContents(doc.contents))
    expect(grouped.map((group) => group.section)).toEqual([
      'Introduction',
      'Materials',
    ])
    expect(grouped[1]!.entries).toHaveLength(2)
  })

  it('keeps a section that returns later as a separate run', () => {
    // Merging the two Materials runs would reorder the issue.
    const grouped = groupContents([
      entry('Materials', 'a'),
      entry('Practice', 'b'),
      entry('Materials', 'c'),
    ])
    expect(grouped.map((group) => group.section)).toEqual([
      'Materials',
      'Practice',
      'Materials',
    ])
  })

  it('puts entries with no heading in a group of their own', () => {
    expect(groupContents([entry('', 'a'), entry('', 'b')])).toEqual([
      { section: '', entries: [entry('', 'a'), entry('', 'b')] },
    ])
  })

  it('has no groups for no entries', () => {
    expect(groupContents([])).toEqual([])
  })
})

describe('toPublicationDetail', () => {
  it('adds what the landing page needs to the card', () => {
    const detail = toPublicationDetail(doc)!
    expect(detail.contents).toHaveLength(3)
    expect(detail).toMatchObject({
      readingDirection: 'ltr',
      firstPageIsCover: true,
      metaTitle: 'Spring 2026 — Beyond Every Art',
      metaDescription: 'A whole issue about blue.',
      updatedAt: '2026-03-02T00:00:00.000Z',
    })
  })

  it('falls back to the stored defaults for a document that predates them', () => {
    const detail = toPublicationDetail({ slug: 'x', title: 'X' })!
    expect(detail.readingDirection).toBe('ltr')
    expect(detail.firstPageIsCover).toBe(true)
    expect(detail.metaTitle).toBeNull()
  })

  it('reads right to left and a coverless first page when they are set', () => {
    const detail = toPublicationDetail({
      ...doc,
      readingDirection: 'rtl',
      firstPageIsCover: false,
    })!
    expect(detail.readingDirection).toBe('rtl')
    expect(detail.firstPageIsCover).toBe(false)
  })

  it('reads an unknown direction as left to right', () => {
    expect(
      toPublicationDetail({ ...doc, readingDirection: 'up' })!.readingDirection,
    ).toBe('ltr')
  })

  it('has nothing to show without a slug or a title', () => {
    expect(toPublicationDetail({ ...doc, slug: undefined })).toBeNull()
  })
})
