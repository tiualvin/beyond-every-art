import type { CollectionConfig, GlobalConfig } from 'payload'
import { describe, expect, it } from 'vitest'

import { Apps } from '../../collections/Apps'
import { Authors } from '../../collections/Authors'
import { Media } from '../../collections/Media'
import { Pages } from '../../collections/Pages'
import { Posts } from '../../collections/Posts'
import { Redirects } from '../../collections/Redirects'
import { Tags } from '../../collections/Tags'
import { Footer } from '../../globals/Footer'
import { Header } from '../../globals/Header'
import { SiteSettings } from '../../globals/SiteSettings'
import {
  CONTENT_TAGS,
  CONTENT_TTL_SECONDS,
  cachedRead,
  revalidateContent,
  type ContentTag,
} from '../../lib/cache/content'
import {
  purgeGlobalOnChange,
  purgeOnChange,
  purgeOnDelete,
  type PurgeHook,
} from '../../lib/cache/purge'

/** Tags carried by the hooks in a list, whatever else is in there too. */
function purgedBy(hooks: unknown[] | undefined): ContentTag[] {
  return (hooks ?? []).flatMap((hook) => [
    ...((hook as PurgeHook<unknown>)?.purgeTags ?? []),
  ])
}

describe('CONTENT_TAGS', () => {
  it('namespaces every tag, so nothing collides with another cache', () => {
    for (const tag of Object.values(CONTENT_TAGS)) {
      expect(tag).toMatch(/^content:/)
    }
  })

  // Two collections sharing a tag would purge each other's reads: harmless in
  // itself, but it would silently widen what a write invalidates and hide the
  // fact that one of them has no tag of its own.
  it('gives each collection a distinct tag', () => {
    const tags = Object.values(CONTENT_TAGS)
    expect(new Set(tags).size).toBe(tags.length)
  })
})

describe('revalidateContent', () => {
  // The seeds, the Ghost importer, and `payload migrate` all write through the
  // same collection hooks, with no Next.js server around them — `revalidateTag`
  // throws there. Aborting a write because a cache that does not exist could
  // not be purged would break the import for no benefit at all.
  it('does not throw when there is no Next.js cache to purge', () => {
    expect(() => revalidateContent([CONTENT_TAGS.posts])).not.toThrow()
  })

  it('keeps going after one tag fails, so later tags are still purged', () => {
    expect(() =>
      revalidateContent([
        CONTENT_TAGS.posts,
        CONTENT_TAGS.tags,
        CONTENT_TAGS.media,
      ]),
    ).not.toThrow()
  })

  it('accepts an empty list', () => {
    expect(() => revalidateContent([])).not.toThrow()
  })
})

describe('purge hooks', () => {
  const doc = { id: 1, title: 'Ultramarine' }

  // Payload passes a hook's return value on to the next hook, so one that
  // forgets to return the document drops every field written before it.
  it('returns the document unchanged', () => {
    const args = { doc } as never

    expect(purgeOnChange(CONTENT_TAGS.posts)(args)).toBe(doc)
    expect(purgeOnDelete(CONTENT_TAGS.posts)(args)).toBe(doc)
    expect(purgeGlobalOnChange(CONTENT_TAGS.globals)(args)).toBe(doc)
  })

  it('reports the tags it purges', () => {
    const hook = purgeOnChange(CONTENT_TAGS.posts, CONTENT_TAGS.media)

    expect(hook.purgeTags).toEqual([CONTENT_TAGS.posts, CONTENT_TAGS.media])
  })

  it('does not let a caller mutate a hook’s tags after the fact', () => {
    const hook = purgeOnChange(CONTENT_TAGS.posts)

    expect(() => {
      ;(hook.purgeTags as ContentTag[]).push(CONTENT_TAGS.pages)
    }).toThrow()
  })
})

// The wiring, not the mechanism. A collection that loses its purge hooks still
// saves, still passes every other test, and serves stale pages until the ten
// minute backstop expires — which is exactly the kind of regression nobody
// notices in a diff.
describe('cache wiring', () => {
  const collections: Array<[string, CollectionConfig, ContentTag]> = [
    ['posts', Posts, CONTENT_TAGS.posts],
    ['pages', Pages, CONTENT_TAGS.pages],
    ['apps', Apps, CONTENT_TAGS.apps],
    ['tags', Tags, CONTENT_TAGS.tags],
    ['authors', Authors, CONTENT_TAGS.authors],
    ['media', Media, CONTENT_TAGS.media],
    ['redirects', Redirects, CONTENT_TAGS.redirects],
  ]

  it.each(collections)(
    'purges %s when a document changes',
    (_, config, tag) => {
      expect(purgedBy(config.hooks?.afterChange)).toContain(tag)
    },
  )

  it.each(collections)(
    'purges %s when a document is deleted',
    (_, config, tag) => {
      expect(purgedBy(config.hooks?.afterDelete)).toContain(tag)
    },
  )

  const globals: Array<[string, GlobalConfig]> = [
    ['site-settings', SiteSettings],
    ['header', Header],
    ['footer', Footer],
  ]

  it.each(globals)('purges %s when it changes', (_, config) => {
    expect(purgedBy(config.hooks?.afterChange)).toContain(CONTENT_TAGS.globals)
  })
})

describe('cachedRead', () => {
  const read = cachedRead('test-read', async (a: number, b: number) => a + b, [
    CONTENT_TAGS.posts,
  ])

  it('wraps a read without needing a server to do it', () => {
    expect(read).toBeTypeOf('function')
  })

  // The asymmetry with `revalidateContent` above, pinned because it is the
  // opposite of what the purge path does and the difference is invisible until
  // something calls one of these from a script. `unstable_cache` requires the
  // incremental cache Next.js installs per request; purging tolerates its
  // absence, reading does not. Nothing outside `app/` calls a cached reader
  // today, and a script that wants one has to query Payload directly.
  it('cannot be called outside a Next.js request', async () => {
    await expect(read(2, 3)).rejects.toThrow(/incrementalCache/)
  })

  // The backstop for the case where on-demand purging does not run at all.
  it('keeps the fallback expiry short enough to matter', () => {
    expect(CONTENT_TTL_SECONDS).toBeGreaterThan(0)
    expect(CONTENT_TTL_SECONDS).toBeLessThanOrEqual(3600)
  })
})
