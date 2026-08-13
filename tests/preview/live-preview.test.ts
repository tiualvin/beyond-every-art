import { describe, expect, it } from 'vitest'

import {
  buildPreviewUrl,
  isPreviewCollection,
  isPreviewRole,
  previewTargetPath,
} from '../../lib/preview/live-preview'

const siteUrl = 'https://beyondeveryart.test'

describe('isPreviewCollection', () => {
  it('accepts the collections rendered on the public site', () => {
    expect(isPreviewCollection('posts')).toBe(true)
    expect(isPreviewCollection('pages')).toBe(true)
  })

  it('rejects anything else the query string might carry', () => {
    expect(isPreviewCollection('users')).toBe(false)
    expect(isPreviewCollection('media')).toBe(false)
    expect(isPreviewCollection('')).toBe(false)
    expect(isPreviewCollection(null)).toBe(false)
    expect(isPreviewCollection(undefined)).toBe(false)
  })
})

describe('isPreviewRole', () => {
  it('admits the editorial roles', () => {
    expect(isPreviewRole({ role: 'admin' })).toBe(true)
    expect(isPreviewRole({ role: 'editor' })).toBe(true)
    expect(isPreviewRole({ role: 'author' })).toBe(true)
  })

  it('refuses anyone without an editorial role', () => {
    // Members authenticate against their own collection and have no editorial
    // standing; an unauthenticated request has no user at all.
    expect(isPreviewRole({ role: 'member' })).toBe(false)
    expect(isPreviewRole({ email: 'reader@example.test' })).toBe(false)
    expect(isPreviewRole({ role: '' })).toBe(false)
    expect(isPreviewRole(null)).toBe(false)
    expect(isPreviewRole(undefined)).toBe(false)
  })

  it('refuses a role that is not a string', () => {
    expect(isPreviewRole({ role: ['admin'] })).toBe(false)
    expect(isPreviewRole({ role: true })).toBe(false)
  })
})

describe('previewTargetPath', () => {
  it('mirrors the Ghost permalink structure the site preserves', () => {
    expect(previewTargetPath('posts', 'lead-white')).toBe('/lead-white/')
    expect(previewTargetPath('pages', 'about')).toBe('/about/')
  })
})

describe('buildPreviewUrl', () => {
  it('builds the preview entry point for a saved document', () => {
    expect(
      buildPreviewUrl({ collection: 'posts', slug: 'lead-white', siteUrl }),
    ).toBe(`${siteUrl}/api/preview?collection=posts&slug=lead-white`)
  })

  it('marks the live-preview variant so the frontend can drop the banner', () => {
    expect(
      buildPreviewUrl({
        collection: 'pages',
        slug: 'about',
        live: true,
        siteUrl,
      }),
    ).toBe(`${siteUrl}/api/preview?collection=pages&slug=about&live=1`)
  })

  it('never puts the shared secret in a URL', () => {
    const url = buildPreviewUrl({
      collection: 'posts',
      slug: 'lead-white',
      siteUrl,
    })
    expect(url).not.toContain('secret')
  })

  it('returns null for a document that has no slug yet', () => {
    // Payload reads null as "no preview available" and hides the button, which
    // is what keeps a new document from opening an iframe on /undefined/.
    expect(buildPreviewUrl({ collection: 'posts', slug: undefined })).toBeNull()
    expect(buildPreviewUrl({ collection: 'posts', slug: '' })).toBeNull()
    expect(buildPreviewUrl({ collection: 'posts', slug: '   ' })).toBeNull()
    expect(buildPreviewUrl({ collection: 'posts', slug: 42 })).toBeNull()
  })

  it('returns null for a collection that has no public URL', () => {
    expect(buildPreviewUrl({ collection: 'users', slug: 'someone' })).toBeNull()
    expect(buildPreviewUrl({ collection: undefined, slug: 'about' })).toBeNull()
  })

  it('escapes slugs rather than pasting them into the query string', () => {
    const url = buildPreviewUrl({
      collection: 'posts',
      slug: 'a&b=c',
      siteUrl,
    })
    expect(url).toBe(`${siteUrl}/api/preview?collection=posts&slug=a%26b%3Dc`)
  })
})

describe('apps preview', () => {
  it('is previewable, so an editor can see a draft app on the real page', () => {
    expect(isPreviewCollection('apps')).toBe(true)
  })

  it('targets the app route rather than a root slug', () => {
    expect(previewTargetPath('apps', 'dapple')).toBe('/apps/dapple')
    expect(
      buildPreviewUrl({ collection: 'apps', slug: 'dapple', siteUrl }),
    ).toBe(`${siteUrl}/api/preview?collection=apps&slug=dapple`)
  })
})
