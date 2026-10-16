import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

import { createApiClient } from '../api/client'
import {
  FIXTURE_ORIGIN,
  createFixtureTransport,
} from '../api/fixture-transport'
import { ServicesProvider, type Services } from '../data/services'
import { createMemoryLibraryStore } from '../library/memory-store'
import { LinkProvider, type LinkActions } from '../reader/link-context'
import { StaticTheme } from '../theme/theme'
import { TEST_SITE } from './render'

export function testServices(overrides: Partial<Services> = {}): Services {
  return {
    api: createApiClient({
      baseUrl: FIXTURE_ORIGIN,
      transport: createFixtureTransport(TEST_SITE),
    }),
    library: createMemoryLibraryStore(),
    usingFixtures: true,
    libraryPersistent: true,
    siteUrl: TEST_SITE,
    ...overrides,
  }
}

export function testLinks(): LinkActions & {
  openArticle: jest.Mock
  openExternal: jest.Mock
} {
  return { siteUrl: TEST_SITE, openArticle: jest.fn(), openExternal: jest.fn() }
}

/** Everything a screen expects above it, with a fresh query cache. */
export function TestProviders({
  services,
  links,
  children,
}: {
  services: Services
  links: LinkActions
  children: ReactNode
}) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, gcTime: Infinity },
          mutations: { retry: false },
        },
      }),
  )
  return (
    <StaticTheme>
      <ServicesProvider services={services}>
        <QueryClientProvider client={client}>
          <LinkProvider actions={links}>{children}</LinkProvider>
        </QueryClientProvider>
      </ServicesProvider>
    </StaticTheme>
  )
}
