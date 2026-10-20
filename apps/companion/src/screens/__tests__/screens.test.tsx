// The tabs and the reader, against the fixtures, with the real router.

import { onlineManager } from '@tanstack/react-query'
import { useLocalSearchParams } from 'expo-router'
import {
  cleanup,
  fireEvent,
  renderRouter,
  screen,
  waitFor,
  within,
} from 'expo-router/testing-library'
import type { ReactNode } from 'react'
import { StyleSheet } from 'react-native'

import { ApiError } from '../../api/client'
import type { Services } from '../../data/services'
import { PIGMENT_COLORS } from '../../generated/brand-tokens'
import { TestProviders, testLinks, testServices } from '../../test/app'
import { PALETTES } from '../../theme/palette'
import { TEST_SITE } from '../../test/render'
import { ArticleScreen } from '../article'
import { DAILY_COLOURS, colourOfTheDay } from '../colours'
import { ExploreScreen } from '../explore'
import { LibraryScreen } from '../library'
import { ReadScreen } from '../read'
import { SearchScreen } from '../search'
import { StudioScreen } from '../studio'
import { TodayScreen } from '../today'

function ArticleRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  return <ArticleScreen slug={slug} />
}

async function show(
  index: () => React.ReactElement | null,
  {
    services = testServices(),
    initialUrl = '/',
  }: { services?: Services; initialUrl?: string } = {},
) {
  const links = testLinks()
  const result = await renderRouter(
    { index, 'article/[slug]': ArticleRoute },
    {
      initialUrl,
      wrapper: ({ children }: { children: ReactNode }) => (
        <TestProviders services={services} links={links}>
          {children}
        </TestProviders>
      ),
    },
  )
  return { ...result, services, links }
}

const offline = new ApiError(
  'network',
  'https://fixtures.invalid/',
  'Network request failed',
)

describe('Today', () => {
  const morning = new Date('2026-10-16T08:00:00Z')

  it('leads with the featured article, and marks the build as a preview', async () => {
    await show(() => <TodayScreen now={() => morning} />)
    expect(
      await screen.findByText('Fixture: every module the reader renders'),
    ).toBeTruthy()
    expect(
      screen.getByLabelText('Preview build, showing sample articles'),
    ).toBeTruthy()
  })

  it('says nothing about a preview when it is reading the website', async () => {
    await show(() => <TodayScreen now={() => morning} />, {
      services: testServices({ usingFixtures: false }),
    })
    await screen.findByText('Fixture: every module the reader renders')
    expect(
      screen.queryByLabelText('Preview build, showing sample articles'),
    ).toBeNull()
  })

  it('shows a colour from the brand’s pigments, and claims nothing about it', async () => {
    await show(() => <TodayScreen now={() => morning} />)
    const colour = colourOfTheDay(morning)
    expect(Object.values(PIGMENT_COLORS)).toContain(colour.hex)
    expect(await screen.findByText(colour.name)).toBeTruthy()
    expect(screen.getByText(colour.hex.toUpperCase())).toBeTruthy()
    expect(
      screen.getByLabelText(`Colour of the day: ${colour.name}`),
    ).toBeTruthy()
    // Nothing about what the app might do one day.
    expect(screen.queryByText(/not built yet|Pigments collection/)).toBeNull()
  })

  it('draws the day’s colour from the mid-tones, never the near-black shades', () => {
    expect(DAILY_COLOURS.map((colour) => colour.name)).toEqual([
      'Cadmium',
      'Viridian',
    ])
    const week = Array.from({ length: 7 }, (_, day) =>
      colourOfTheDay(new Date(Date.UTC(2026, 9, 16 + day))),
    )
    expect(new Set(week.map((colour) => colour.name)).size).toBe(2)
  })

  it('opens the lead article in the reader', async () => {
    const rendered = await show(() => <TodayScreen now={() => morning} />)
    await fireEvent.press(
      await screen.findByText('Fixture: every module the reader renders'),
    )
    await waitFor(() =>
      expect(rendered.getPathname()).toBe('/article/fixture-every-module'),
    )
    expect(
      await screen.findByText('The last paragraph, after every module.'),
    ).toBeTruthy()
  })
})

describe('Read', () => {
  it('lists articles newest first, with their topics', async () => {
    await show(ReadScreen)
    const titles = await screen.findAllByText(/^(Fixture|E2E): ?/)
    expect(titles.length).toBeGreaterThan(3)
    expect(screen.getByText('Topics')).toBeTruthy()
    expect(screen.getAllByText('Materials').length).toBeGreaterThan(0)
  })

  it('marks a gated article in the list', async () => {
    await show(ReadScreen)
    expect(await screen.findByText(/Members$/)).toBeTruthy()
  })

  it('leads each row with its headline, and keeps the topic in the footer', async () => {
    await show(ReadScreen)
    const title = await screen.findByText(
      'Fixture: every module the reader renders',
    )
    const row = within(
      screen.getByLabelText(/^Fixture: every module the reader renders\./),
    )
    const words = row.getAllByText(/.+/).map((node) => node.props.children)
    expect(words[0]).toBe(title.props.children)
    expect(words.indexOf('Reading')).toBeGreaterThan(0)
  })

  it('stands each section label on its own rule', async () => {
    await show(ReadScreen)
    const label = await screen.findByText('Newest')
    const header = label.parent!
    expect(header.children[0]).toBe(label)
    expect(header.children).toHaveLength(2)
  })
})

describe('Search', () => {
  it('asks for a term, then searches titles and standfirsts', async () => {
    await show(() => <SearchScreen debounceMs={0} />)
    expect(screen.getByText('Search the journal')).toBeTruthy()
    await fireEvent.changeText(
      screen.getByLabelText('Search articles'),
      'migrated',
    )
    expect(
      await screen.findByText('Fixture: a migrated Ghost article'),
    ).toBeTruthy()
  })

  it('says when nothing matches', async () => {
    await show(() => <SearchScreen debounceMs={0} />)
    await fireEvent.changeText(
      screen.getByLabelText('Search articles'),
      'ultramarine',
    )
    expect(
      await screen.findByText('Nothing matches “ultramarine”'),
    ).toBeTruthy()
  })
})

describe('Explore', () => {
  it('shows topics and authors, and no roadmap', async () => {
    await show(ExploreScreen)
    expect(await screen.findByText('Conservation')).toBeTruthy()
    expect(await screen.findByText('Fixture Editor')).toBeTruthy()
    expect(screen.queryByText(/More to explore|once the website/)).toBeNull()
  })
})

describe('Studio', () => {
  it('builds a palette from the brand and keeps it on the device', async () => {
    const { services } = await show(StudioScreen)
    expect(await screen.findByText('No palettes yet')).toBeTruthy()
    // Making a palette is what the screen is for: the primary fill, not a tint.
    expect(
      StyleSheet.flatten(
        screen.getByRole('button', { name: 'New palette' }).props.style,
      ).backgroundColor,
    ).toBe(PALETTES.light.button)

    await fireEvent.press(screen.getByText('New palette'))
    expect(screen.getByLabelText('Remove Burgundy')).toBeTruthy()
    await fireEvent.press(screen.getByLabelText('Add Viridian deep'))
    await fireEvent.changeText(
      screen.getByLabelText('Palette name'),
      'Night studio',
    )
    await fireEvent.press(screen.getByText('Save palette'))

    expect(await screen.findByText('Night studio')).toBeTruthy()
    const [stored] = await services.library.listPalettes()
    expect(stored?.name).toBe('Night studio')
    expect(stored?.colours).toContain(PIGMENT_COLORS.viridianDeep)
  })

  it('still starts a palette, and tries again, when the saved ones fail to load', async () => {
    const services = testServices()
    jest
      .spyOn(services.library, 'listPalettes')
      .mockRejectedValueOnce(new Error('Storage is unavailable'))
    await show(StudioScreen, { services })
    expect(await screen.findByText('Couldn’t load this')).toBeTruthy()
    expect(screen.getByText('New palette')).toBeTruthy()
    await fireEvent.press(screen.getByText('Try again'))
    expect(await screen.findByText('No palettes yet')).toBeTruthy()
  })

  it('refuses a colour that is not six hex digits', async () => {
    await show(StudioScreen)
    await fireEvent.press(await screen.findByText('New palette'))
    await fireEvent.changeText(screen.getByLabelText('Hex colour'), 'red')
    await fireEvent.press(screen.getByText('Add colour'))
    expect(screen.getByText(/six hex digits/)).toBeTruthy()
  })
})

describe('Library', () => {
  it('says what to do when it is empty, and offers the way there', async () => {
    const rendered = await show(LibraryScreen)
    expect(await screen.findByText('Nothing saved yet')).toBeTruthy()
    expect(screen.getByText('No bookmarks yet')).toBeTruthy()
    await fireEvent.press(screen.getByText('Find something to read'))
    await waitFor(() => expect(rendered.getPathname()).toBe('/read'))
  })

  it('opens what is on this device with the network gone', async () => {
    // The query cache pauses reads while the device is offline. Everything
    // here is local, and once waited for a network it never needed.
    const services = testServices()
    const post = await services.api.getPost('fixture-migrated-article')
    if (!post) throw new Error('The migrated fixture is missing.')
    await services.library.saveArticle(post)
    await services.library.addBookmark(post)
    onlineManager.setOnline(false)
    try {
      await show(LibraryScreen, { services })
      expect(await screen.findAllByText(post.title)).toHaveLength(2)
    } finally {
      onlineManager.setOnline(true)
    }
  })

  it('warns when nothing will survive a restart', async () => {
    await show(LibraryScreen, {
      services: testServices({ libraryPersistent: false }),
    })
    expect(await screen.findByText(/lasts\s+until the app closes/)).toBeTruthy()
  })
})

describe('the reader', () => {
  it('saves an article that then reads with no network at all', async () => {
    const services = testServices()
    await show(ArticleRoute, {
      services,
      initialUrl: '/article/fixture-migrated-article',
    })
    await fireEvent.press(
      await screen.findByLabelText('Save for offline reading'),
    )
    expect(await screen.findByText('Saved offline')).toBeTruthy()
    expect(
      await services.library.getSaved('fixture-migrated-article'),
    ).not.toBeNull()

    // A new session, with the network gone.
    await cleanup()
    const unreachable = {
      ...services,
      api: { ...services.api, getPost: jest.fn().mockRejectedValue(offline) },
    }
    await show(ArticleRoute, {
      services: unreachable,
      initialUrl: '/article/fixture-migrated-article',
    })
    expect(await screen.findByText('A section heading')).toBeTruthy()
    expect(
      screen.getByText('You are reading the copy saved on this device.'),
    ).toBeTruthy()
  })

  it('says it is offline when an unsaved article cannot load', async () => {
    const services = testServices()
    await show(ArticleRoute, {
      services: {
        ...services,
        api: { ...services.api, getPost: jest.fn().mockRejectedValue(offline) },
      },
      initialUrl: '/article/fixture-every-module',
    })
    expect(await screen.findByText(/Check your connection/)).toBeTruthy()
    expect(screen.getByText('Couldn’t load this')).toBeTruthy()
  })

  it('bookmarks an article for the Library', async () => {
    const { services } = await show(ArticleRoute, {
      initialUrl: '/article/fixture-every-module',
    })
    await fireEvent.press(await screen.findByLabelText('Bookmark'))
    expect(await screen.findByText('Bookmarked')).toBeTruthy()
    expect(await services.library.isBookmarked('fixture-every-module')).toBe(
      true,
    )
  })

  it('hands a page that is not an article to the browser', async () => {
    const { links } = await show(ArticleRoute, { initialUrl: '/article/about' })
    expect(await screen.findByText('Not an article in the app')).toBeTruthy()
    await fireEvent.press(screen.getByText('Open on the website'))
    expect(links.openExternal).toHaveBeenCalledWith(`${TEST_SITE}/about/`)
  })

  it('shows a gated article’s teaser with no way to buy or sign in', async () => {
    await show(ArticleRoute, {
      initialUrl: '/article/e2e-members-conservation-notes',
    })
    expect(
      await screen.findByText('The rest of this piece is for members'),
    ).toBeTruthy()
    expect(screen.queryByText(/buy|purchase|sign in|log in/i)).toBeNull()
  })
})
