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
