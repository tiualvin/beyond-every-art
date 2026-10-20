// The showcase set: sample articles that look like the journal's, for preview
// builds and for judging the design.
//
// The module fixtures (posts.ts, blocks.ts) are test cases, and their copy is
// about the app itself so that nothing in them could be mistaken for the
// publication's reporting. That makes them a poor picture of the product: a
// screen of "Fixture: every module the reader renders" says nothing about how
// the app reads. These are the opposite trade, kept honest three ways:
//
//   - Nothing here is, or is copied from, production content. Titles avoid the
//     live site's, and the brief forbids production data in the app.
//   - Claims stay general and long documented — that ultramarine was ground
//     from lapis lazuli, that verdigris attacks paper — never a date, a figure
//     or an attribution a reader would take as the journal's own research.
//   - They are marked as samples. Today carries a "Preview · sample articles"
//     badge whenever the app serves fixtures, but an article opened from Read
//     or Explore has no badge, so the byline is a stand-in and no image is
//     credited to the publication: nothing signs a sample with its name.
//
// Images point at the same unreachable host as the module fixtures, so a
// preview build makes no request to anyone, and the lead shows the plate a
// missing image gets.
//
// Selected with EXPO_PUBLIC_FIXTURE_SET=showcase, the default for the app;
// tests use the module set (docs/COMPANION_APP.md).

import type { Author, BodyNode, PostDetail, TagRef } from '../api/contract'
import { fixtureMedia, paragraph, text } from './blocks'

export const SHOWCASE_AUTHOR: Author = {
  name: 'Sample author',
  slug: 'sample-author',
  bio: 'A stand-in byline for the sample articles in the companion app’s preview builds.',
  image: null,
}

const TAGS = {
  materials: { name: 'Materials', slug: 'materials' },
  colour: { name: 'Colour', slug: 'colour' },
  conservation: { name: 'Conservation', slug: 'conservation' },
  technique: { name: 'Technique', slug: 'technique' },
} satisfies Record<string, TagRef>

const p = (...sentences: string[]): BodyNode =>
  paragraph(text(sentences.join(' ')))

const h2 = (words: string): BodyNode => ({
  type: 'heading',
  tag: 'h2',
  children: [text(words)],
})

const quote = (words: string): BodyNode => ({
  type: 'quote',
  children: [text(words)],
})

const ultramarineBody: BodyNode[] = [
  p(
    'For most of the history of European painting, the most expensive thing on a palette was a blue. Natural ultramarine was ground from lapis lazuli, a stone mined in the mountains of what is now Afghanistan and carried west along trade routes that added to its price at every stage.',
    'A painter could not simply buy more of it. The colour was rationed by its supply, and contracts for altarpieces sometimes named how much of it was to be used, and where.',
  ),
  h2('A stone that is mostly not blue'),
  p(
    'Lapis lazuli is a rock rather than a single mineral. The blue comes from one of its constituents; the rest is grey and white matter that, ground together with it, gives a dull and greyish powder.',
    'Grinding the stone was therefore only the beginning. The blue particles had to be separated from everything else, and the best of the pigment came from the first and most thorough extraction.',
  ),
  quote(
    'The colour was rationed by its supply, and the supply was a single region of mountains.',
  ),
  h2('Kneading the blue out'),
  p(
    'The method painters’ handbooks describe is closer to a separation process than to grinding. The powdered stone was worked into a dough of wax, resin and oil, then kneaded under a weak alkaline solution; the blue particles left the dough and the impurities stayed behind.',
    'Repeated washes gave paler and greyer grades. The first was the deepest and the dearest, and the last, sold cheaply, was good for little more than a sky.',
  ),
  {
    type: 'block',
    fields: {
      blockType: 'keyTakeaways',
      heading: 'Key takeaways',
      items: [
        'Natural ultramarine came from lapis lazuli, a rock that is only partly blue.',
        'The pigment was separated from the stone, not simply ground from it.',
        'The first extraction was the richest grade, and later washes were paler and cheaper.',
      ],
    },
  },
  h2('The end of a scarcity'),
  p(
    'In the nineteenth century a synthetic ultramarine, chemically close to the natural pigment, was made in quantity, and the blue that had been rationed for centuries became one of the cheapest on the shelf.',
    'Painters gained a reliable, affordable colour. What they lost was a pigment whose cost had once been part of its meaning.',
  ),
]

const short = (...paragraphs: string[][]): BodyNode[] =>
  paragraphs.map((sentences) => p(...sentences))

/** The showcase articles, newest first, with hrefs on the configured site. */
export function showcasePosts(siteUrl: string): PostDetail[] {
  const href = (slug: string) => `${siteUrl}/${slug}/`
  const post = (
    slug: string,
    fields: Omit<
      PostDetail,
      'slug' | 'href' | 'authors' | 'updatedAt' | 'restricted' | 'visibility'
    > &
      Partial<Pick<PostDetail, 'restricted' | 'visibility'>>,
  ): PostDetail => ({
    slug,
    href: href(slug),
    authors: [SHOWCASE_AUTHOR],
    updatedAt: fields.publishedAt,
    visibility: 'public',
    restricted: false,
    ...fields,
  })

  return [
    post('why-ultramarine-cost-more-than-gold', {
      title: 'Why Ultramarine Cost More Than Gold',
      excerpt:
        'For centuries the most expensive colour in European painting came from one stone, in one range of mountains. What made it so hard to get is the same thing that made it so hard to replace.',
      publishedAt: '2026-10-15T08:00:00.000Z',
      featured: true,
      readingTime: 12,
      tags: [TAGS.materials, TAGS.colour],
      image: fixtureMedia('lapis-lazuli', {
        alt: 'Lapis lazuli, ground to four grades of blue',
      }),
      body: { kind: 'lexical', nodes: ultramarineBody },
    }),
    post('the-search-for-a-perfect-white', {
      title: 'The Search for a Perfect White',
      excerpt:
        'Every white a painter has used has traded one virtue for another: opacity for warmth, brilliance for safety.',
      publishedAt: '2026-10-12T08:00:00.000Z',
      featured: false,
      readingTime: 9,
      tags: [TAGS.materials],
      image: null,
      body: {
        kind: 'lexical',
        nodes: short(
          [
            'White does more work on a palette than any other colour. It lightens every mixture, it carries the light in a painting, and it makes up much of the paint film itself.',
          ],
          [
            'No single white has ever done all of that well. Each one painters have relied on has asked them to accept a weakness in return for a strength.',
          ],
        ),
      },
    }),
    post('what-raking-light-shows', {
      title: 'What Raking Light Shows That Daylight Hides',
      excerpt:
        'Turn the lamp sideways and a flat painting becomes a landscape of brushwork, losses and repairs.',
      publishedAt: '2026-10-09T08:00:00.000Z',
      featured: false,
      readingTime: 7,
      tags: [TAGS.conservation],
      image: null,
      body: {
        kind: 'lexical',
        nodes: short(
          [
            'Light that falls almost parallel to a painting’s surface throws every ridge into relief. Brushstrokes cast shadows, raised paint catches the light, and the surface stops looking flat.',
          ],
          [
            'Conservators use it to read the condition of a work before they touch it: where paint is lifting, where a canvas has been stretched unevenly, where an old repair sits on top of the original.',
          ],
        ),
      },
    }),
    post('verdigris-the-green-that-eats-its-support', {
      title: 'Verdigris, the Green That Eats Its Own Support',
      excerpt:
        'A brilliant copper green so corrosive that manuscripts survive with holes where it was painted.',
      publishedAt: '2026-10-06T08:00:00.000Z',
      featured: false,
      readingTime: 8,
      tags: [TAGS.colour, TAGS.conservation],
      image: null,
      body: {
        kind: 'lexical',
        nodes: short(
          [
            'Verdigris is the green that forms on copper. Painters made it deliberately and valued it for a clarity no earth green could match.',
          ],
          [
            'It is also chemically aggressive. On paper and parchment it can eat through the support it was painted on, which is why some illuminated pages survive with the green passages missing.',
          ],
        ),
      },
    }),
    post('reading-a-craquelure-like-a-map', {
      title: 'Reading a Craquelure Like a Map',
      excerpt:
        'The pattern of cracks across an old painting records how it was made, where it has been, and what has happened to it since.',
      publishedAt: '2026-10-03T08:00:00.000Z',
      featured: false,
      readingTime: 11,
      tags: [TAGS.conservation],
      image: null,
      visibility: 'members',
      restricted: true,
      body: {
        kind: 'lexical',
        nodes: short(
          [
            'Every old painting cracks. The network of fine lines across its surface — the craquelure — is not damage in the ordinary sense so much as a record of the materials settling and the support moving over time.',
          ],
          [
            'Different grounds, panels and canvases crack in different patterns, and a conservator learns to read them the way a geologist reads strata.',
          ],
        ),
      },
    }),
    post('madder-lake-and-the-colour-of-fading', {
      title: 'Madder Lake and the Colour of Fading',
      excerpt:
        'A warm, transparent red from a plant root, and one of the first colours to leave a painting.',
      publishedAt: '2026-09-29T08:00:00.000Z',
      featured: false,
      readingTime: 6,
      tags: [TAGS.colour],
      image: null,
      body: {
        kind: 'lexical',
        nodes: short(
          [
            'Madder lake is made from the root of the madder plant, its dye fixed onto a colourless base so that it can be used as a pigment. In oil it glazes to a deep, glowing red.',
          ],
          [
            'Lake pigments made from dyes are often less lightfast than mineral ones. A red that was rich when the painting was new can be pale, or gone, after centuries on a wall.',
          ],
        ),
      },
    }),
    post('smalt-blue-glass-ground-to-powder', {
      title: 'Smalt: Blue Glass, Ground to Powder',
      excerpt:
        'A cheaper blue than ultramarine, made from cobalt glass, and prone to turning grey.',
      publishedAt: '2026-09-25T08:00:00.000Z',
      featured: false,
      readingTime: 5,
      tags: [TAGS.colour, TAGS.materials],
      image: null,
      body: {
        kind: 'lexical',
        nodes: short(
          [
            'Smalt is glass coloured with cobalt and ground to a powder. It was far cheaper than ultramarine and widely used for skies and draperies.',
          ],
          [
            'In an oil medium it can lose its colour over time, which is why some blue skies in old paintings now read as grey.',
          ],
        ),
      },
    }),
    post('why-a-varnish-yellows', {
      title: 'Why a Varnish Yellows',
      excerpt:
        'The layer meant to protect a painting and saturate its colours can end up hiding them.',
      publishedAt: '2026-09-21T08:00:00.000Z',
      featured: false,
      readingTime: 10,
      tags: [TAGS.conservation, TAGS.technique],
      image: null,
      body: {
        kind: 'lexical',
        nodes: short(
          [
            'A varnish deepens the colours beneath it and protects the paint from dirt. Varnishes made from natural resins also change as they age, darkening and yellowing as they oxidise.',
          ],
          [
            'Much of what conservators call cleaning is the careful removal of an old, discoloured varnish — and part of why a cleaned painting can look so startlingly different.',
          ],
        ),
      },
    }),
    post('three-blacks', {
      title: 'Charcoal, Bone and Vine: Three Blacks',
      excerpt:
        'Black is not one colour on a palette. The blacks made from bone, vine and soot each lean a different way.',
      publishedAt: '2026-09-17T08:00:00.000Z',
      featured: false,
      readingTime: 7,
      tags: [TAGS.technique, TAGS.colour],
      image: null,
      body: {
        kind: 'lexical',
        nodes: short(
          [
            'Painters’ blacks are made by burning things: bones, vine twigs, oil for its soot. Each gives a black with its own undertone and its own way of mixing.',
          ],
          [
            'Mixed with white, one leans warm and another cool, and the greys a painter gets from each are as different as the materials they came from.',
          ],
        ),
      },
    }),
  ]
}
