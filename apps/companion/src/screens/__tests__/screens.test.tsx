// The tabs and the reader, against the fixtures, with the real router.

import { useLocalSearchParams } from 'expo-router'
import {
  cleanup,
  fireEvent,
  renderRouter,
  screen,
  waitFor,
} from 'expo-router/testing-library'
import type { ReactNode } from 'react'

import { ApiError } from '../../api/client'
import type { Services } from '../../data/services'
import { PIGMENT_COLORS } from '../../generated/brand-tokens'
import { TestProviders, testLinks, testServices } from '../../test/app'
import { TEST_SITE } from '../../test/render'
import { ArticleScreen } from '../article'
import { pigmentOfTheDay } from '../colours'
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

  it('leads with the featured article, and says the content is sample content', async () => {
    await show(() => <TodayScreen now={() => morning} />)
    expect(
      await screen.findByText('Fixture: every module the reader renders'),
    ).toBeTruthy()
    expect(screen.getByText(/Sample content/)).toBeTruthy()
  })

  it('shows a colour from the brand’s pigments, and claims nothing about it', async () => {
    await show(() => <TodayScreen now={() => morning} />)
    const pigment = pigmentOfTheDay(morning)
    expect(Object.values(PIGMENT_COLORS)).toContain(pigment.hex)
    expect(await screen.findByText(pigment.name)).toBeTruthy()
    expect(screen.getByText(pigment.hex.toUpperCase())).toBeTruthy()
    expect(screen.getByText(/which is not built yet/)).toBeTruthy()
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
  it('shows topics and authors, and says what is not here yet', async () => {
    await show(ExploreScreen)
    expect(await screen.findByText('Conservation')).toBeTruthy()
    expect(await screen.findByText('Fixture Editor')).toBeTruthy()
    expect(screen.getByText('More to explore later')).toBeTruthy()
    expect(
      screen.getByText(/once the website has collections for them/),
    ).toBeTruthy()
  })
})

describe('Studio', () => {
  it('builds a palette from the brand and keeps it on the device', async () => {
    const { services } = await show(StudioScreen)
    expect(await screen.findByText('No palettes yet')).toBeTruthy()

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

  it('refuses a colour that is not six hex digits', async () => {
    await show(StudioScreen)
    await fireEvent.press(await screen.findByText('New palette'))
    await fireEvent.changeText(screen.getByLabelText('Hex colour'), 'red')
    await fireEvent.press(screen.getByText('Add colour'))
    expect(screen.getByText(/six hex digits/)).toBeTruthy()
  })
})

describe('Library', () => {
  it('says what to do when it is empty', async () => {
    await show(LibraryScreen)
    expect(await screen.findByText('Nothing saved yet')).toBeTruthy()
    expect(screen.getByText('No bookmarks yet')).toBeTruthy()
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
    expect(await screen.findByText(/could not reach the website/)).toBeTruthy()
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
