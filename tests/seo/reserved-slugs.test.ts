import { readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  RESERVED_ROOT_SLUGS,
  isReservedRootSlug,
  normalizeRootSlug,
  validateRootContentSlug,
} from '../../lib/seo/reserved-slugs'

const APP_DIRECTORY = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../app',
)

const ROUTE_FILE_PATTERN = /^(?:page|route)\.[^.]+$/
const ROUTE_GROUP_PATTERN = /^\(.+\)$/
const DYNAMIC_SEGMENT_PATTERN = /^\[.+\]$/

function containsRouteFile(directory: string): boolean {
  return readdirSync(directory, { withFileTypes: true }).some((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory()
      ? containsRouteFile(path)
      : ROUTE_FILE_PATTERN.test(entry.name)
  })
}

function staticRootRouteSegments(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory()) return []

    const path = join(directory, entry.name)
    if (ROUTE_GROUP_PATTERN.test(entry.name)) {
      return staticRootRouteSegments(path)
    }

    // Dynamic segments (including catch-alls) match migrated content rather
    // than claiming a static root slug, so they are intentionally excluded.
    if (DYNAMIC_SEGMENT_PATTERN.test(entry.name)) return []

    return containsRouteFile(path) ? [entry.name] : []
  })
}

function metadataRootRouteSegments(directory: string): string[] {
  const metadataRoutes: Record<string, string> = {
    'robots.ts': 'robots.txt',
    'sitemap.ts': 'sitemap.xml',
  }

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isFile()) return []
    const segment = metadataRoutes[entry.name]
    return segment ? [segment] : []
  })
}

describe('reserved root slugs', () => {
  it('normalizes case, whitespace, and surrounding slashes', () => {
    expect(normalizeRootSlug(' /Publication/ ')).toBe('publication')
  })

  it('protects current and planned application routes', () => {
    expect(isReservedRootSlug('journal')).toBe(true)
    expect(isReservedRootSlug('author')).toBe(true)
    expect(isReservedRootSlug('tag')).toBe(true)
    expect(isReservedRootSlug('publication')).toBe(true)
    expect(isReservedRootSlug('an-essay-on-blue')).toBe(false)
  })

  it('stays aligned with the static top-level App Router segments', () => {
    // `publication` is reserved ahead of its planned route. Dynamic root
    // segments such as `[slug]` are deliberately discovered and excluded by
    // `staticRootRouteSegments` because they do not own a literal root slug.
    const policyOnlySegments = ['publication']
    const discoveredSegments = [
      ...staticRootRouteSegments(APP_DIRECTORY),
      ...metadataRootRouteSegments(APP_DIRECTORY),
      ...policyOnlySegments,
    ]

    expect([...RESERVED_ROOT_SLUGS].sort()).toEqual(
      [...new Set(discoveredSegments)].sort(),
    )
  })

  it('returns a Payload-compatible validation result', () => {
    expect(validateRootContentSlug('an-essay-on-blue')).toBe(true)
    expect(validateRootContentSlug('publication')).toContain(
      'reserved for an application route',
    )
  })
})
