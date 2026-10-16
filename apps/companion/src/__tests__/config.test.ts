import appConfig from '../../app.config'
import { BRAND_COLORS } from '../generated/brand-tokens'
import { DEFAULT_SITE_URL, readConfig } from '../config'

describe('app configuration', () => {
  it('defaults to fixtures and the production site', () => {
    expect(readConfig(undefined)).toEqual({
      apiBaseUrl: null,
      siteUrl: DEFAULT_SITE_URL,
    })
  })

  it('reads a configured website, without its trailing slash', () => {
    expect(
      readConfig({
        apiBaseUrl: 'http://localhost:3000/',
        siteUrl: 'http://localhost:3000/',
      }),
    ).toEqual({
      apiBaseUrl: 'http://localhost:3000',
      siteUrl: 'http://localhost:3000',
    })
  })

  it('falls back to the safe default for a value it cannot use', () => {
    expect(
      readConfig({ apiBaseUrl: 'ftp://example.com', siteUrl: 'not a url' }),
    ).toEqual({ apiBaseUrl: null, siteUrl: DEFAULT_SITE_URL })
  })
})

describe('app.config.ts', () => {
  it('paints the splash screen in the brand’s paper', () => {
    const plugins = (appConfig.plugins ?? []) as unknown[]
    const splash = plugins.find(
      (plugin): plugin is [string, { backgroundColor: string }] =>
        Array.isArray(plugin) && plugin[0] === 'expo-splash-screen',
    )
    expect(splash?.[1].backgroundColor).toBe(BRAND_COLORS.paper)
  })

  it('proposes one identifier for both platforms, and no EAS project', () => {
    expect(appConfig.ios?.bundleIdentifier).toBe('com.beyondeveryart.companion')
    expect(appConfig.android?.package).toBe('com.beyondeveryart.companion')
    expect(appConfig.extra).not.toHaveProperty('eas')
  })

  it('reads fixtures unless an API is configured', () => {
    expect(appConfig.extra?.apiBaseUrl).toBeNull()
  })
})
