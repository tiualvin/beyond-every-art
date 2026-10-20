// What app.config.ts put in `extra`, validated before anything trusts it.
//
// A malformed value falls back to the safe default rather than failing the app:
// an unusable API base URL means fixtures, and an unusable site URL means the
// production origin, which is only ever used to recognise links.

import Constants from 'expo-constants'
import { z } from 'zod/v4'

import { WebUrlSchema } from './api/contract'
import type { FixtureSet } from './api/fixture-transport'

export const DEFAULT_SITE_URL = 'https://www.beyondeveryart.com'

export type AppConfig = {
  /** Null means fixtures: no request for content leaves the device. */
  apiBaseUrl: string | null
  /** The website's origin, without a trailing slash. */
  siteUrl: string
  /** Which sample posts the fixtures serve when there is no API. */
  fixtureSet: FixtureSet
}

const ExtraSchema = z.object({
  apiBaseUrl: WebUrlSchema.nullable().catch(null),
  siteUrl: WebUrlSchema.catch(DEFAULT_SITE_URL),
  fixtureSet: z.enum(['showcase', 'modules']).catch('showcase'),
})

const withoutTrailingSlash = (url: string) => url.replace(/\/+$/, '')

export function readConfig(extra: unknown): AppConfig {
  const parsed = ExtraSchema.safeParse(extra ?? {})
  const value = parsed.success
    ? parsed.data
    : {
        apiBaseUrl: null,
        siteUrl: DEFAULT_SITE_URL,
        fixtureSet: 'showcase' as const,
      }
  return {
    apiBaseUrl: value.apiBaseUrl
      ? withoutTrailingSlash(value.apiBaseUrl)
      : null,
    siteUrl: withoutTrailingSlash(value.siteUrl),
    fixtureSet: value.fixtureSet,
  }
}

export const appConfig: AppConfig = readConfig(Constants.expoConfig?.extra)
