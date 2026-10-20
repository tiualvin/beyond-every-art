import { appConfig } from '../config'
import { createApiClient, fetchTransport } from './client'
import { FIXTURE_ORIGIN, createFixtureTransport } from './fixture-transport'

/** True when the app is showing its bundled sample content. */
export const usingFixtures = appConfig.apiBaseUrl === null

/** The app's one client, against the configured website or the fixtures. */
export const api = appConfig.apiBaseUrl
  ? createApiClient({
      baseUrl: appConfig.apiBaseUrl,
      transport: fetchTransport,
    })
  : createApiClient({
      baseUrl: FIXTURE_ORIGIN,
      transport: createFixtureTransport(
        appConfig.siteUrl,
        appConfig.fixtureSet,
      ),
    })
