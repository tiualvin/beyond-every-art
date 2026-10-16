// The native renderer, against the fixtures the API contract is tested with.

import { fireEvent, screen } from '@testing-library/react-native'

import {
  BodyNodeSchema,
  PostDetailSchema,
  markUnsupported,
  type BodyNode,
  type PostDetail,
} from '../../api/contract'
import { BLOCK_SLUGS, type BlockSlug } from '../../generated/block-slugs'
import {
  blockFixtures,
  linkParagraph,
  paragraph,
  text,
  unknownBlockFixture,
  unknownNodeFixture,
} from '../../fixtures/blocks'
import { GATED_MARKERS, fixturePosts } from '../../fixtures/posts'
import { TEST_SITE, renderReader } from '../../test/render'
import { Article } from '../article'
import { resetUnsupportedWarnings } from '../diagnostics'
import { LexicalNodes } from '../lexical'

const asReceived = (slug: string): PostDetail => {
  const post = fixturePosts(TEST_SITE).find(
    (candidate) => candidate.slug === slug,
  )!
  return PostDetailSchema.parse({ ...post, body: markUnsupported(post.body) })
}

const node = (raw: unknown): BodyNode =>
  BodyNodeSchema.parse(markUnsupported(raw))

type Rendered = Awaited<ReturnType<typeof renderReader>>

// The showcase article carries an unknown block and node on purpose; the
// reader warns about them in development, and these tests listen.
let warn: jest.SpyInstance
beforeEach(() => {
  resetUnsupportedWarnings()
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => warn.mockRestore())

/**
 * One check per block type, keyed by the generated slugs: a block the website
 * adds cannot be left untested here without a type error.
 */
const checks: Record<BlockSlug, (rendered: Rendered) => Promise<void>> = {
  accordion: async () => {
    expect(screen.getByText('Panels')).toBeTruthy()
    expect(
      screen.getByText('This panel is expanded when it loads.'),
    ).toBeTruthy()
    expect(screen.queryByText('formatting included')).toBeNull()
    await fireEvent.press(screen.getByText('Closed until tapped'))
    expect(screen.getByText('formatting included')).toBeTruthy()
  },
  pullQuote: async ({ actions }) => {
    expect(
      screen.getByText('A quotation, set apart from the body around it.'),
    ).toBeTruthy()
    await fireEvent.press(screen.getByText('— The fixture'))
    expect(actions.openExternal).toHaveBeenCalledWith(
      'https://example.com/source',
    )
  },
  signup: async ({ actions }) => {
    expect(screen.getByText('The next article, by email')).toBeTruthy()
    // A link to the website's own signup page; no address field in the app.
    expect(screen.queryByPlaceholderText(/email/i)).toBeNull()
    await fireEvent.press(screen.getByText('Sign up on the website'))
    expect(actions.openExternal).toHaveBeenCalledWith(
      `${TEST_SITE}/newsletter/`,
    )
  },
  callout: async () => {
    expect(
      screen.getByText('An aside, set apart from the argument it sits beside.'),
    ).toBeTruthy()
  },
  button: async ({ actions }) => {
    // /journal/ is a website route, not an article: the browser.
    await fireEvent.press(screen.getByText('Browse the journal'))
    expect(actions.openExternal).toHaveBeenCalledWith(`${TEST_SITE}/journal/`)
    expect(actions.openArticle).not.toHaveBeenCalled()
  },
  gallery: async () => {
    expect(screen.getByText('The first image')).toBeTruthy()
    expect(screen.getByText('Two images shown together.')).toBeTruthy()
    expect(screen.getByLabelText('Fixture image: gallery second')).toBeTruthy()
  },
  bookmark: async ({ actions }) => {
    await fireEvent.press(screen.getByText('An essay somewhere else'))
    expect(actions.openExternal).toHaveBeenCalledWith(
      'https://example.com/an-essay',
    )
    expect(screen.getByText('Example Review')).toBeTruthy()
  },
  embed: async ({ actions }) => {
    expect(
      screen.getByText('A video the app links to rather than frames'),
    ).toBeTruthy()
    await fireEvent.press(screen.getByText('Watch on YouTube'))
    expect(actions.openExternal).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=fixture00001',
    )
  },
  paywall: async ({ toJSON }) => {
    expect(toJSON()).toBeNull()
  },
  keyTakeaways: async () => {
    expect(screen.getByText('Key takeaways')).toBeTruthy()
    expect(
      screen.getByText('A link to another article opens inside the app.'),
    ).toBeTruthy()
  },
  faq: async () => {
    expect(screen.getByText('Does the reader use a web view?')).toBeTruthy()
    expect(screen.getByText('No. Each node is a native view.')).toBeTruthy()
  },
  featureList: async () => {
    expect(screen.getByText('Three steps')).toBeTruthy()
    expect(screen.getByText('1. Open an article')).toBeTruthy()
    expect(screen.getByText('3. Read it offline')).toBeTruthy()
  },
  mediaText: async () => {
    expect(screen.getByText('An image beside a passage')).toBeTruthy()
    expect(screen.getByLabelText('Fixture image: media text')).toBeTruthy()
  },
  comparisonTable: async ({ actions }) => {
    expect(
      screen.getByText('Two columns compared across three rows.'),
    ).toBeTruthy()
    expect(screen.getByText('only one')).toBeTruthy()
    // The third row has one cell for two columns: padded, not dropped.
    expect(screen.getAllByText('—')).toHaveLength(1)
    await fireEvent.press(screen.getByText('a source'))
    expect(actions.openExternal).toHaveBeenCalledWith(
      'https://example.com/table-source',
    )
  },
  keyFacts: async () => {
    expect(screen.getByText('At a glance')).toBeTruthy()
    expect(screen.getByText('Web views')).toBeTruthy()
    expect(screen.getByText('None')).toBeTruthy()
  },
}

describe('every block type', () => {
  const fixtures = blockFixtures(TEST_SITE)

  it.each([...BLOCK_SLUGS])('%s renders natively', async (slug) => {
    const rendered = await renderReader(
      <LexicalNodes nodes={[node(fixtures[slug])]} />,
    )
    await checks[slug](rendered)
  })
})

describe('rich text', () => {
  it('follows each kind of link by the link policy', async () => {
    const { actions } = await renderReader(
      <LexicalNodes nodes={[node(linkParagraph(TEST_SITE))]} />,
    )

    await fireEvent.press(
      screen.getByText('another article, opened in the app'),
    )
    expect(actions.openArticle).toHaveBeenCalledWith(
      'fixture-migrated-article',
      `${TEST_SITE}/fixture-migrated-article/`,
    )

    await fireEvent.press(screen.getByText('a page off the site'))
    expect(actions.openExternal).toHaveBeenCalledWith(
      'https://example.com/elsewhere',
    )

    await fireEvent.press(screen.getByText('an email address'))
    expect(actions.openExternal).toHaveBeenCalledWith(
      'mailto:editor@example.com',
    )
  })

  it('renders a heading that repeats the title, because the server left it there', async () => {
    const post = asReceived('fixture-every-module')
    await renderReader(<Article post={post} />)
    // Once as the title, once as the body's own heading.
    expect(screen.getAllByText(post.title)).toHaveLength(2)
  })

  it('draws an image with its alt text and the server’s credit link', async () => {
    const post = asReceived('fixture-every-module')
    const { actions } = await renderReader(<Article post={post} />)
    expect(screen.getByLabelText('Fixture image: body upload')).toBeTruthy()
    await fireEvent.press(
      screen.getAllByText('Photo by A. Fixture / Unsplash')[0]!,
    )
    expect(actions.openExternal).toHaveBeenCalledWith(
      'https://unsplash.com/@fixture?utm_source=beyond_every_art&utm_medium=referral',
    )
  })

  it('renders lists, including a checklist a screen reader can read', async () => {
    await renderReader(<Article post={asReceived('fixture-every-module')} />)
    expect(screen.getByText('Nested')).toBeTruthy()
    // The numbered list starts at three; only it has a fourth item.
    expect(screen.getByText('4.')).toBeTruthy()
    expect(screen.getByLabelText('Done')).toBeTruthy()
    expect(screen.getByLabelText('Not done')).toBeTruthy()
  })
})

describe('content the app does not know', () => {
  it('renders nothing for an unknown block or node, and does not crash', async () => {
    const { toJSON } = await renderReader(
      <LexicalNodes
        nodes={[node(unknownBlockFixture), node(unknownNodeFixture)]}
      />,
    )
    expect(toJSON()).toBeNull()
    expect(screen.queryByText('A slide')).toBeNull()
  })

  it('warns once per kind in development, however often it appears', async () => {
    await renderReader(
      <LexicalNodes
        nodes={[
          node(unknownBlockFixture),
          node(unknownBlockFixture),
          node(unknownNodeFixture),
          paragraph(text('around it')),
          node(unknownNodeFixture),
        ]}
      />,
    )
    expect(screen.getByText('around it')).toBeTruthy()
    expect(warn).toHaveBeenCalledTimes(2)
    expect(warn.mock.calls.map(([message]) => message)).toEqual([
      expect.stringContaining('"carousel"'),
      expect.stringContaining('"table"'),
    ])
  })

  it('renders the rest of an article around them', async () => {
    await renderReader(<Article post={asReceived('fixture-every-module')} />)
    expect(
      screen.getByText('The last paragraph, after every module.'),
    ).toBeTruthy()
  })
})

describe('the migrated HTML path', () => {
  const post = asReceived('fixture-migrated-article')

  it('renders the words, the structure and the captions', async () => {
    await renderReader(<Article post={post} />)
    expect(screen.getByText('A section heading')).toBeTruthy()
    expect(
      screen.getByText('A Ghost image card, with its caption.'),
    ).toBeTruthy()
    expect(screen.getByText('Two, nested')).toBeTruthy()
    expect(screen.getByText('4.')).toBeTruthy()
    expect(screen.getByText('A quotation in the migrated markup.')).toBeTruthy()
    expect(screen.getByText('const preserved = true')).toBeTruthy()
    expect(
      screen.getByText('Entities decode: Turner & Constable, 10 cm, “quoted”.'),
    ).toBeTruthy()
    expect(
      screen.getByLabelText('Fixture image: a figure from Ghost'),
    ).toBeTruthy()
  })

  it('leaves scripts, frames, forms and styles behind', async () => {
    await renderReader(<Article post={post} />)
    expect(screen.queryByText(/stolen|cookie/)).toBeNull()
    expect(screen.queryByText('Subscribe')).toBeNull()
    expect(screen.queryByText(/display: none/)).toBeNull()
    expect(
      screen.getByText('Inline styles are dropped; the words stay.'),
    ).toBeTruthy()
  })

  it('opens links to articles in the app, relative or absolute, and others outside', async () => {
    const { actions } = await renderReader(<Article post={post} />)
    await fireEvent.press(screen.getByText('the module showcase'))
    await fireEvent.press(screen.getByText('its full address'))
    expect(actions.openArticle).toHaveBeenNthCalledWith(
      1,
      'fixture-every-module',
      `${TEST_SITE}/fixture-every-module/`,
    )
    expect(actions.openArticle).toHaveBeenCalledTimes(2)

    await fireEvent.press(screen.getByText('a link off the site'))
    expect(actions.openExternal).toHaveBeenCalledWith(
      'https://example.com/ghost-link',
    )
  })

  it('shows the seeded duplicate-title post’s title once', async () => {
    const duplicate = asReceived('e2e-duplicate-title-heading')
    await renderReader(<Article post={duplicate} />)
    expect(screen.getAllByText(duplicate.title)).toHaveLength(1)
    expect(
      screen.getByText(
        'The heading above came from Ghost and must not reach the page.',
      ),
    ).toBeTruthy()
  })
})

describe('gated posts', () => {
  it('shows the website’s teaser and says membership is coming', async () => {
    await renderReader(
      <Article post={asReceived('e2e-members-conservation-notes')} />,
    )
    expect(screen.getByText(new RegExp(GATED_MARKERS.teaser))).toBeTruthy()
    expect(screen.queryByText(new RegExp(GATED_MARKERS.gated))).toBeNull()
    expect(screen.getByText('Members only')).toBeTruthy()
    expect(
      screen.getByText('The rest of this piece is for members'),
    ).toBeTruthy()
  })

  it('offers nothing to buy and nowhere to sign in', async () => {
    await renderReader(
      <Article post={asReceived('fixture-subscriber-teaser')} />,
    )
    expect(screen.getByText('Subscribers only')).toBeTruthy()
    expect(
      screen.queryByText(/buy|purchase|sign in|log in|subscribe now|price/i),
    ).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('renders a rich-text teaser as received', async () => {
    await renderReader(
      <Article post={asReceived('fixture-subscriber-teaser')} />,
    )
    expect(
      screen.getByText(
        'The second, which is where the server stopped sending.',
      ),
    ).toBeTruthy()
  })
})

describe('an empty body', () => {
  it('says so rather than showing a blank page', async () => {
    await renderReader(<Article post={asReceived('fixture-empty-body')} />)
    expect(
      screen.getByText('This article has no text the app can show.'),
    ).toBeTruthy()
  })
})
