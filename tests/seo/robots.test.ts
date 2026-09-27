// What `/robots.txt` lets a crawler fetch, evaluated the way crawlers evaluate
// it rather than by reading the rule list.
//
// The rules looked right for a month and were not: `Disallow: /api` also
// covered `/api/media/file/`, which is where every upload is served from, so
// Google could fetch an article but not the image its `og:image` and Article
// JSON-LD pointed at. Nothing about `allow: '/'` beside `disallow: ['/api']`
// reads as "no images", which is why this checks paths, not strings.

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it, vi } from 'vitest'

import robots from '@/app/robots'
import { LOCAL_IMAGE_PATTERN } from '@/lib/security/images'
import { MEDIA_FILE_PATH } from '@/lib/seo/site'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

const list = (value: string | string[] | undefined): string[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value]

/**
 * RFC 9309 §2.2.2 for the `*` group: the longest matching rule wins, and an
 * Allow wins a tie. Every rule this site writes is a plain prefix, so prefix
 * matching is the whole of the algorithm here.
 */
function allowed(path: string): boolean {
  const { rules } = robots()
  const group = (Array.isArray(rules) ? rules : [rules]).find((rule) =>
    list(rule.userAgent).includes('*'),
  )
  if (!group) return true

  let best: { length: number; allow: boolean } = { length: -1, allow: true }
  for (const [patterns, allow] of [
    [list(group.allow), true],
    [list(group.disallow), false],
  ] as const) {
    for (const pattern of patterns) {
      if (!path.startsWith(pattern)) continue
      if (
        pattern.length > best.length ||
        (pattern.length === best.length && allow)
      ) {
        best = { length: pattern.length, allow }
      }
    }
  }
  return best.allow
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('robots.txt on the production site', () => {
  it('lets crawlers fetch uploaded images', () => {
    expect(allowed('/api/media/file/photo.jpeg')).toBe(true)
    // The 1200×630 derivative that `og:image` names.
    expect(allowed('/api/media/file/photo-1200x630.jpg')).toBe(true)
  })

  it('still keeps them out of the API and the admin panel', () => {
    // The collection endpoint, which lists every upload's metadata.
    expect(allowed('/api/media')).toBe(false)
    expect(allowed('/api/media?limit=0')).toBe(false)
    expect(allowed('/api/posts')).toBe(false)
    expect(allowed('/api/users/login')).toBe(false)
    expect(allowed('/admin')).toBe(false)
  })

  it('leaves the pages and the resized images open', () => {
    expect(allowed('/')).toBe(true)
    expect(allowed('/physics-light-renaissance-painting/')).toBe(true)
    expect(allowed('/tag/palette/')).toBe(true)
    expect(allowed('/_next/image/?url=%2Fapi%2Fmedia%2Ffile%2Fa.jpg')).toBe(
      true,
    )
  })
})

describe('robots.txt on staging', () => {
  it('still disallows everything, uploads included', () => {
    vi.stubEnv('NEXT_PUBLIC_NOINDEX', '1')
    expect(allowed('/')).toBe(false)
    expect(allowed('/api/media/file/photo.jpeg')).toBe(false)
  })
})

describe('the media prefix', () => {
  // Three files name the same path for three reasons. If they disagree, either
  // crawlers are allowed a path that serves nothing, or the site serves images
  // no crawler may fetch — the second being the bug this file exists for.
  it('is the prefix the Caddyfile serves on the public hostname', () => {
    const caddyfile = readFileSync(join(root, 'Caddyfile'), 'utf8')
    expect(caddyfile).toContain(`not path ${MEDIA_FILE_PATH}*`)
  })

  it('is the prefix the image optimizer accepts', () => {
    expect(LOCAL_IMAGE_PATTERN.pathname).toBe(`${MEDIA_FILE_PATH}**`)
  })
})
