// The image optimizer's policy, pinned clause by clause.
//
// `/_next/image` is public, unauthenticated, and runs sharp on demand, and
// nothing in front of the application covers it. Each assertion below names the
// bypass its clause closes, because the failure mode for all of them is silent:
// the site keeps rendering images either way, and the only difference is what a
// stranger can make the server do.

import { describe, expect, it } from 'vitest'

import {
  ALLOWED_IMAGE_QUALITY,
  buildImageConfig,
  imageRemotePatterns,
  LOCAL_IMAGE_PATTERN,
} from '../../lib/security/images'

describe('buildImageConfig', () => {
  it('allows exactly one quality, so `q` is not 100 variants per width', () => {
    // Unset, Next accepts any integer 1-100 and only checks an allowed set when
    // `qualities` is configured — 1,600 sharp runs per source image across the
    // 16 default widths, each one a file in a cache with no size ceiling.
    expect(buildImageConfig({}).qualities).toEqual([ALLOWED_IMAGE_QUALITY])
  })

  it('pins that quality to the one `next/image` already asks for', () => {
    // No component passes a `quality` prop, so this is what every real request
    // uses. If that stops being true this number has to move with it.
    expect(ALLOWED_IMAGE_QUALITY).toBe(75)
  })

  it('accepts local images only under the media route', () => {
    // With `localPatterns` unset, Next matches any local path — and resolves a
    // local `url` by dispatching it through the app's own handler, bypassing
    // Caddy's refusal of `/api*`. Uploads are the only local images the site
    // renders, so they are the whole allowlist.
    expect(buildImageConfig({}).localPatterns).toEqual([
      { pathname: '/api/media/file/**', search: '' },
    ])
  })

  it('refuses a local url that carries a query string', () => {
    // `search: ''` is what stops `/api/media/file/x.jpg?limit=0`-shaped
    // smuggling past a pathname-only pattern. Payload's media URLs carry none.
    expect(LOCAL_IMAGE_PATTERN.search).toBe('')
  })

  it('names no remote host when object storage is not configured', () => {
    // Not a gap: with no S3_PUBLIC_URL every media URL is root-relative and the
    // local pattern above is what applies.
    expect(imageRemotePatterns({})).toEqual([])
  })

  it('names the object-storage host, over https only, when one is set', () => {
    expect(
      imageRemotePatterns({ S3_PUBLIC_URL: 'https://media.example.com/files' }),
    ).toEqual([{ hostname: 'media.example.com', protocol: 'https' }])
  })
})
