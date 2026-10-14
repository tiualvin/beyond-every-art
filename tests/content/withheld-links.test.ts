import { describe, expect, it } from 'vitest'

import type { ArticleBody } from '../../lib/content/body'
import {
  siteSlugOf,
  unlinkWithheld,
  withholdUnpublishedLinks,
} from '../../lib/content/withheld-links'

const SITE = 'https://www.beyondeveryart.com'

const text = (value: string) => ({
  type: 'text',
  version: 1,
  text: value,
  format: 0,
  mode: 'normal',
  style: '',
  detail: 0,
})

const link = (url: string, label: string, type = 'link') => ({
  type,
  version: 3,
  fields: { url, newTab: false, linkType: 'custom' },
  children: [text(label)],
  direction: 'ltr',
  format: '',
  indent: 0,
})

const paragraph = (...children: unknown[]) => ({
  type: 'paragraph',
  version: 1,
  format: '',
  indent: 0,
  direction: 'ltr',
  children,
})

const lexical = (...children: unknown[]): ArticleBody => ({
  kind: 'lexical',
  content: {
    root: {
      type: 'root',
      version: 1,
      format: '',
      indent: 0,
      direction: 'ltr',
      children: children as never,
    },
  },
})

const childrenOf = (body: ArticleBody) =>
  (body as Extract<ArticleBody, { kind: 'lexical' }>).content.root.children!

describe('siteSlugOf', () => {
  it('reads the slug from a link to an article on this site', () => {
    expect(siteSlugOf(`${SITE}/egg-tempera/`, SITE)).toBe('egg-tempera')
    expect(siteSlugOf('/egg-tempera/', SITE)).toBe('egg-tempera')
    expect(siteSlugOf('https://beyondeveryart.com/egg-tempera', SITE)).toBe(
      'egg-tempera',
    )
    expect(siteSlugOf(`${SITE}/egg-tempera/#history`, SITE)).toBe('egg-tempera')
  })

  it('is null for anything that is not one article on this site', () => {
    expect(siteSlugOf('https://example.com/egg-tempera/', SITE)).toBeNull()
    expect(siteSlugOf(`${SITE}/tag/pigments/`, SITE)).toBeNull()
    expect(siteSlugOf(`${SITE}/`, SITE)).toBeNull()
    expect(siteSlugOf('#history', SITE)).toBeNull()
    expect(siteSlugOf('mailto:editor@beyondeveryart.com', SITE)).toBeNull()
    expect(siteSlugOf('', SITE)).toBeNull()
    expect(siteSlugOf(undefined, SITE)).toBeNull()
  })
})

describe('withholdUnpublishedLinks', () => {
  const withheld = new Set(['egg-tempera-the-medium-oil-replaced'])

  // The case that left seven live articles linking to 404s on 7 Oct 2026: a
  // published article naming one scheduled for later.
  it('renders a link to an article that is not live yet as its words', () => {
    const body = lexical(
      paragraph(
        text('A '),
        link(
          `${SITE}/egg-tempera-the-medium-oil-replaced/`,
          'fast-drying medium like tempera',
        ),
        text(' cannot be worked this way.'),
      ),
    )

    const out = withholdUnpublishedLinks(body, withheld, SITE)
    const [first] = childrenOf(out)

    expect(first.children).toEqual([
      text('A '),
      text('fast-drying medium like tempera'),
      text(' cannot be worked this way.'),
    ])
  })

  it('leaves every other link alone, and the stored body untouched', () => {
    const body = lexical(
      paragraph(
        link(`${SITE}/what-is-an-artists-proof/`, 'proof status'),
        link('https://example.com/egg-tempera-the-medium-oil-replaced/', 'x'),
      ),
    )
    const before = JSON.stringify(body)

    const out = withholdUnpublishedLinks(body, withheld, SITE)

    expect(out).toBe(body)
    expect(JSON.stringify(body)).toBe(before)
  })

  it('does not mutate the body it was given when it does unlink', () => {
    const body = lexical(
      paragraph(link('/egg-tempera-the-medium-oil-replaced/', 'tempera')),
    )
    const before = JSON.stringify(body)

    withholdUnpublishedLinks(body, withheld, SITE)

    expect(JSON.stringify(body)).toBe(before)
  })

  it('reaches links inside a module, such as an FAQ answer', () => {
    const answer = {
      root: {
        type: 'root',
        children: [
          paragraph(
            text('See '),
            link('/egg-tempera-the-medium-oil-replaced/', 'egg tempera'),
          ),
        ],
      },
    }
    const body = lexical({
      type: 'block',
      version: 2,
      fields: {
        blockType: 'faq',
        items: [{ id: 'q1', question: 'Why?', answer }],
      },
    })

    const out = withholdUnpublishedLinks(body, withheld, SITE)
    const block = childrenOf(out)[0] as {
      fields: { items: Array<{ answer: typeof answer }> }
    }

    expect(block.fields.items[0].answer.root.children[0].children).toEqual([
      text('See '),
      text('egg tempera'),
    ])
  })

  it('treats an autolink the same way', () => {
    const body = lexical(
      paragraph(
        link(
          `${SITE}/egg-tempera-the-medium-oil-replaced/`,
          `${SITE}/egg-tempera-the-medium-oil-replaced/`,
          'autolink',
        ),
      ),
    )

    const [first] = childrenOf(withholdUnpublishedLinks(body, withheld, SITE))

    expect(first.children).toEqual([
      text(`${SITE}/egg-tempera-the-medium-oil-replaced/`),
    ])
  })

  // Migrated Ghost bodies are injected as a string and link only to what Ghost
  // had already published. They are not rewritten.
  it('leaves an HTML body as it is', () => {
    const body: ArticleBody = {
      kind: 'html',
      html: '<p><a href="/egg-tempera-the-medium-oil-replaced/">x</a></p>',
    }

    expect(withholdUnpublishedLinks(body, withheld, SITE)).toBe(body)
  })

  it('costs nothing when nothing is withheld', () => {
    const body = lexical(
      paragraph(link('/egg-tempera-the-medium-oil-replaced/', 'x')),
    )

    expect(withholdUnpublishedLinks(body, new Set(), SITE)).toBe(body)
  })
})

describe('unlinkWithheld', () => {
  it('unwraps nested links and keeps the order of their words', () => {
    const tree = [
      text('a'),
      link('/x/', 'b'),
      { type: 'link', fields: { url: '/x/' }, children: [link('/x/', 'c')] },
      text('d'),
    ]

    expect(unlinkWithheld(tree, (href) => href === '/x/')).toEqual([
      text('a'),
      text('b'),
      text('c'),
      text('d'),
    ])
  })
})
