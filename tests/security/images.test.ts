// The image optimizer's policy, pinned clause by clause.
//
// `/_next/image` is public, unauthenticated, and runs sharp on demand, and
// nothing in front of the application covers it. Each assertion below names the
// bypass its clause closes, because the failure mode for all of them is silent:
// the site keeps rendering images either way, and the only difference is what a
// stranger can make the server do.

import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  ALLOWED_IMAGE_QUALITY,
  buildImageConfig,
  IMAGE_CACHE_TTL_SECONDS,
  imageRemotePatterns,
  LOCAL_IMAGE_PATTERN,
} from '../../lib/security/images'

const ROOT = resolve(import.meta.dirname, '../..')

/** Every source file under `dirs`, as repository-relative paths. */
function sourceFiles(dirs: string[]): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (/\.(c|m)?[jt]sx?$/.test(entry.name))
        out.push(relative(ROOT, path))
    }
  }
  for (const dir of dirs) walk(join(ROOT, dir))
  return out.sort()
}

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
    // Scoped to the prefix the public URL carries, not the whole host. A
    // hostname-only pattern matched every key on the bucket, and Next fetches a
    // remote url before it can decide the response is not an image — so each
    // request was a billed storage operation for a key that need not exist,
    // uncached and payable again on the next one.
    expect(
      imageRemotePatterns({ S3_PUBLIC_URL: 'https://media.example.com/files' }),
    ).toEqual([
      {
        hostname: 'media.example.com',
        protocol: 'https',
        pathname: '/files/**',
        search: '',
      },
    ])
  })

  it('scopes to the whole host when the public URL carries no prefix', () => {
    expect(
      imageRemotePatterns({ S3_PUBLIC_URL: 'https://media.example.com' }),
    ).toEqual([
      {
        hostname: 'media.example.com',
        protocol: 'https',
        pathname: '/**',
        search: '',
      },
    ])
  })

  it('ignores a trailing slash rather than producing a doubled prefix', () => {
    // `https://host/files/` and `https://host/files` name the same prefix, and
    // `/files//**` would match neither.
    expect(
      imageRemotePatterns({
        S3_PUBLIC_URL: 'https://media.example.com/files/',
      }),
    ).toEqual([
      {
        hostname: 'media.example.com',
        protocol: 'https',
        pathname: '/files/**',
        search: '',
      },
    ])
  })

  it('allows no remote host at all when the public URL is malformed', () => {
    // This used to throw out of `new URL` and take the whole Next config with
    // it, so a typo in one variable failed the build rather than the variable.
    expect(imageRemotePatterns({ S3_PUBLIC_URL: 'not-a-url' })).toEqual([])
  })
})

describe('how long a resized image is cached', () => {
  it('is a week, not the framework’s 60 seconds', () => {
    // At 60s every page view a minute after the last asked the VPS again for
    // every image on it — about 0.8s to first byte each, featured image
    // included.
    expect(IMAGE_CACHE_TTL_SECONDS).toBe(604_800)
    expect(buildImageConfig({}).minimumCacheTTL).toBe(IMAGE_CACHE_TTL_SECONDS)
  })

  it('rests on no code writing new bytes over an existing media filename', () => {
    // A week is only safe because a media URL never starts serving different
    // bytes: Payload renames a colliding upload rather than overwrite it. The
    // way round that is `overwriteExistingFiles: true`, and each file below
    // uses it to write the *same* bytes back — the original, re-uploaded to
    // regenerate sizes or to restore a lost file, or a page image whose name
    // is a hash of its bytes.
    //
    // A new entry here is a new way for a cached URL to go stale. Read
    // `IMAGE_CACHE_TTL_SECONDS` in lib/security/images.ts before adding it:
    // either the new path writes identical bytes too, or the TTL has to come
    // down.
    const writers = sourceFiles([
      'app',
      'blocks',
      'collections',
      'components',
      'fields',
      'globals',
      'lib',
      'scripts',
    ]).filter((file) =>
      readFileSync(join(ROOT, file), 'utf8').includes('overwriteExistingFiles'),
    )
    expect(writers).toEqual([
      'lib/publications/processing/store.ts',
      'scripts/backfill-media-sizes.ts',
      'scripts/restore-media-from-ghost.ts',
    ])
  })

  it('serves one modern format, because Cloudflare cannot keep two', () => {
    // Next picks the output format from the request's Accept header and says
    // so with `Vary: Accept`. Cloudflare ignores that, and keying its cache on
    // Accept is Enterprise-only, so a URL it caches holds one variant for
    // everyone. The rule in docs/EDGE_CACHING.md admits only requests that
    // accept WebP, which is correct while WebP is the only format Next
    // produces. Turning on AVIF here would let whichever format was fetched
    // first be served to every browser — change that rule first.
    expect(buildImageConfig({}).formats).toBeUndefined()
  })
})
