import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  absoluteUrl,
  authorPath,
  getSiteUrl,
  pagePath,
  postPath,
  PUBLICATION_PATH,
  publicationPath,
  publicationReadPath,
  publicationTranscriptPath,
  tagPath,
} from '../../lib/seo/site'

describe('getSiteUrl', () => {
  const original = { ...process.env }

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SITE_URL
    delete process.env.NEXT_PUBLIC_SERVER_URL
    delete process.env.PAYLOAD_PUBLIC_SERVER_URL
  })

  afterEach(() => {
    process.env = { ...original }
  })

  it('prefers NEXT_PUBLIC_SITE_URL and trims trailing slashes', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://beyondeveryart.com/'
    expect(getSiteUrl()).toBe('https://beyondeveryart.com')
  })

  it('falls back through the server URL variables', () => {
    process.env.NEXT_PUBLIC_SERVER_URL = 'https://server.example'
    expect(getSiteUrl()).toBe('https://server.example')
  })

  it('falls back to localhost when nothing is configured', () => {
    expect(getSiteUrl()).toBe('http://localhost:3000')
  })
})

describe('path builders', () => {
  it('mirror the Ghost trailing-slash permalink structure', () => {
    expect(postPath('titanium-white')).toBe('/titanium-white/')
    expect(pagePath('about')).toBe('/about/')
    expect(tagPath('materials')).toBe('/tag/materials/')
    expect(authorPath('livia')).toBe('/author/livia/')
  })

  it('builds publication routes without trailing slashes', () => {
    expect(PUBLICATION_PATH).toBe('/publication')
    expect(publicationPath('spring-2025')).toBe('/publication/spring-2025')
    expect(publicationReadPath('spring-2025')).toBe(
      '/publication/spring-2025/read',
    )
    expect(publicationTranscriptPath('spring-2025')).toBe(
      '/publication/spring-2025/transcript',
    )
  })
})

describe('absoluteUrl', () => {
  it('joins a path onto the site origin', () => {
    expect(absoluteUrl('/about/', 'https://beyondeveryart.com')).toBe(
      'https://beyondeveryart.com/about/',
    )
    expect(absoluteUrl('about', 'https://beyondeveryart.com')).toBe(
      'https://beyondeveryart.com/about',
    )
  })

  it('passes absolute URLs through unchanged', () => {
    expect(
      absoluteUrl('https://cdn.example/x.jpg', 'https://beyondeveryart.com'),
    ).toBe('https://cdn.example/x.jpg')
  })
})
