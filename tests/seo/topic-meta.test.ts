import { describe, expect, it } from 'vitest'

import type { MediaImage } from '@/lib/content/media'
import {
  DESCRIPTION_LIMIT,
  describeTopic,
  topicMeta,
  type TopicMetaInput,
} from '@/lib/seo/topic-meta'

const SITE = 'Beyond Every Art'

function image(url: string): MediaImage {
  return {
    url,
    alt: '',
    width: 2400,
    height: 1600,
    caption: null,
    credit: null,
    creditURL: null,
    cardUrl: null,
    ogUrl: null,
  }
}

function archive(overrides: Partial<TopicMetaInput> = {}): TopicMetaInput {
  return {
    name: 'Palette',
    description: '',
    metaTitle: null,
    metaDescription: null,
    image: null,
    posts: [
      { title: 'Why Burnt Sienna Behaves Differently', image: null },
      { title: 'The Chemistry of Ultramarine', image: image('/b.jpg') },
      { title: 'Lead White, Briefly', image: image('/c.jpg') },
    ],
    ...overrides,
  }
}

describe('topicMeta', () => {
  it('prefers what an editor wrote for search', () => {
    const meta = topicMeta(
      archive({
        metaTitle: 'Colour and pigment',
        metaDescription: 'Written for search.',
        description: 'Written for readers.',
      }),
      SITE,
    )
    // Used as written, like a post's metaTitle: no site suffix added.
    expect(meta.title).toEqual({ absolute: 'Colour and pigment' })
    expect(meta.description).toBe('Written for search.')
  })

  it('falls back to the description readers see, then to one it builds', () => {
    expect(
      topicMeta(archive({ description: 'Written for readers.' }), SITE)
        .description,
    ).toBe('Written for readers.')

    // Every tag on the live site today: no description of any kind.
    expect(topicMeta(archive(), SITE).description).toBe(
      '3 articles on Palette from Beyond Every Art: “Why Burnt Sienna Behaves ' +
        'Differently”, “The Chemistry of Ultramarine” and “Lead White, Briefly”.',
    )
  })

  it('treats a blank field as absent', () => {
    expect(
      topicMeta(archive({ metaDescription: '  ', description: 'Kept.' }), SITE)
        .description,
    ).toBe('Kept.')
  })

  it('keeps the tag name as the title, for the layout to suffix', () => {
    expect(topicMeta(archive(), SITE).title).toBe('Palette')
  })

  it('shares the tag’s own image, else the newest article that has one', () => {
    expect(
      topicMeta(archive({ image: image('/tag.jpg') }), SITE).image?.url,
    ).toBe('/tag.jpg')
    // The newest post has no image; the next one does.
    expect(topicMeta(archive(), SITE).image?.url).toBe('/b.jpg')
    expect(
      topicMeta(archive({ posts: [{ title: 'A', image: null }] }), SITE).image,
    ).toBeNull()
  })
})

describe('describeTopic', () => {
  it('says nothing about an empty archive', () => {
    expect(describeTopic('Palette', [], SITE)).toBeUndefined()
  })

  it('counts in the singular', () => {
    expect(describeTopic('Music', [{ title: 'One Piece' }], SITE)).toBe(
      '1 article on Music from Beyond Every Art: “One Piece”.',
    )
  })

  it('names the newest three and says there are more', () => {
    const posts = ['A', 'B', 'C', 'D', 'E'].map((title) => ({ title }))
    expect(describeTopic('Palette', posts, SITE)).toBe(
      '5 articles on Palette from Beyond Every Art, including “A”, “B” and “C”.',
    )
  })

  it('drops titles until the sentence fits, and never cuts one in half', () => {
    // 39 characters: two fit inside the limit with the lead, three do not.
    const long = 'A Long Title About the Chemistry of Blue'
    const posts = [long, long, long, long].map((title) => ({ title }))
    const sentence = describeTopic('Palette', posts, SITE)!
    expect(sentence.length).toBeLessThanOrEqual(DESCRIPTION_LIMIT)
    expect(sentence).toBe(
      `4 articles on Palette from Beyond Every Art, including “${long}” and “${long}”.`,
    )
  })

  it('falls back to the count when not even one title fits', () => {
    const posts = [{ title: 'x'.repeat(200) }, { title: 'y' }]
    expect(describeTopic('Palette', posts, SITE)).toBe(
      '2 articles on Palette from Beyond Every Art.',
    )
  })

  it('keeps each title on one line', () => {
    expect(describeTopic('Palette', [{ title: 'Two\n  lines' }], SITE)).toBe(
      '1 article on Palette from Beyond Every Art: “Two lines”.',
    )
  })
})
