import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ArchiveFilter } from '../../app/(frontend)/components/archive-filter'
import type { PostCard, TagRef } from '../../lib/content/queries'
import { assignPigments, pigmentFor } from '../../lib/design/pigments'

// The journal's topic filter draws a dot in each topic's colour, and it drew
// them by hashing each slug alone while the homepage chart and the tag pages
// assign over the whole subject list. Where two subjects' hashes collide the
// two disagreed: Studio Insider was Raw Umber on the homepage and Palette's
// Verdigris here, beside Palette itself.

/** The live subjects on 22 Sep, largest first. */
const SUBJECTS = [
  'art',
  'palette',
  'studio-notes',
  'exhibitions',
  'music',
  'studio-insider',
  'science-of-art-materials',
  'materials-science',
]

function post(slug: string, tags: TagRef[]): PostCard {
  return {
    id: slug,
    slug,
    title: slug,
    excerpt: '',
    publishedAt: '2026-02-08T07:00:00.000Z',
    featured: false,
    authors: [],
    tags,
    image: null,
    readingTime: 1,
    visibility: 'public',
  }
}

const render = (posts: PostCard[]) =>
  renderToStaticMarkup(<ArchiveFilter posts={posts} subjects={SUBJECTS} />)

const dot = (hex: string) => `background:${hex}`

describe('ArchiveFilter topic colours', () => {
  it('matches the colours the homepage chart assigns', () => {
    const html = render([
      post('a', [{ slug: 'palette', name: 'Palette' }]),
      post('b', [{ slug: 'studio-insider', name: 'Studio Insider' }]),
    ])
    const assigned = assignPigments(SUBJECTS)

    expect(html).toContain(dot(assigned.get('palette')!.hex))
    expect(html).toContain(dot(assigned.get('studio-insider')!.hex))
    // The collision itself: on its own, Studio Insider hashes to Palette's.
    expect(pigmentFor('studio-insider').hex).toBe(assigned.get('palette')!.hex)
    expect(html.split(dot(assigned.get('palette')!.hex))).toHaveLength(2)
  })

  it('falls back to the hashed colour for a tag that is not a subject', () => {
    const html = render([post('a', [{ slug: 'featured', name: 'Featured' }])])

    expect(html).toContain(dot(pigmentFor('featured').hex))
  })
})
