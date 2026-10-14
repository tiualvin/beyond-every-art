import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import type { CollectionConfig, FieldAccess } from 'payload'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Posts } from '../../collections/Posts'
import { findField } from '../support/fields'
import {
  deleteOwnedDrafts,
  isAdmin,
  isAuthenticated,
  isEditor,
  ownedPosts,
  pagesRead,
  postsRead,
  publishedOrEditors,
  versionsOf,
} from '../../access/roles'

// `notScheduled()` reads the clock, so the rules are compared at a fixed moment.
const NOW = new Date('2026-10-14T16:00:00.000Z')
const onTheSite = [
  { _status: { equals: 'published' } },
  {
    or: [
      { publishedAt: { less_than_equal: NOW.toISOString() } },
      { publishedAt: { exists: false } },
    ],
  },
  { deletedAt: { exists: false } },
]

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('role checks', () => {
  const admin = { id: 1, role: 'admin' as const }
  const editor = { id: 2, role: 'editor' as const }
  const author = { id: 3, role: 'author' as const }

  it('recognizes administrators', () => {
    expect(isAdmin(admin)).toBe(true)
    expect(isAdmin(editor)).toBe(false)
    expect(isAdmin(author)).toBe(false)
  })

  it('allows administrators and editors through editor checks', () => {
    expect(isEditor(admin)).toBe(true)
    expect(isEditor(editor)).toBe(true)
    expect(isEditor(author)).toBe(false)
  })

  it('requires a user for authenticated checks', () => {
    expect(isAuthenticated(author)).toBe(true)
    expect(isAuthenticated(null)).toBe(false)
    expect(isAuthenticated(undefined)).toBe(false)
  })

  it('limits authors to owned posts while staff can edit every post', async () => {
    expect(await ownedPosts({ req: { user: author } } as never)).toEqual({
      owners: { equals: author.id },
    })
    expect(await ownedPosts({ req: { user: editor } } as never)).toBe(true)
    expect(await ownedPosts({ req: { user: null } } as never)).toBe(false)
  })

  it('lets authors delete owned drafts but not published posts', async () => {
    expect(await deleteOwnedDrafts({ req: { user: author } } as never)).toEqual(
      {
        and: [
          { owners: { equals: author.id } },
          { _status: { equals: 'draft' } },
        ],
      },
    )
    expect(await deleteOwnedDrafts({ req: { user: admin } } as never)).toBe(
      true,
    )
  })

  it('exposes published content while retaining owner draft access', async () => {
    // Members-only and paid posts stay gated: published alone is not enough.
    const publiclyReadable = {
      and: [...onTheSite, { visibility: { equals: 'public' } }],
    }
    expect(await postsRead({ req: { user: null } } as never)).toEqual(
      publiclyReadable,
    )
    expect(await postsRead({ req: { user: author } } as never)).toEqual({
      or: [publiclyReadable, { owners: { equals: author.id } }],
    })
    expect(await postsRead({ req: { user: editor } } as never)).toBe(true)
    expect(
      await publishedOrEditors({ req: { user: author } } as never),
    ).toEqual({ _status: { equals: 'published' } })
  })

  // A forged `Authorization` header reaches the API on the CMS hostname as an
  // anonymous caller. With `_status` as the only condition, that caller read
  // every scheduled post weeks early — 58 of them, checked on 14 Oct 2026 — and
  // anything trashed after publication. The rule now matches what the site
  // serves; `publicationsReadFor` has applied the same conditions since #204.
  it('withholds scheduled and trashed posts and pages from readers', async () => {
    for (const user of [null, author]) {
      const posts = (await postsRead({ req: { user } } as never)) as {
        and?: unknown[]
        or?: Array<{ and?: unknown[] }>
      }
      const readable = posts.and ?? posts.or?.[0]?.and
      for (const condition of onTheSite) {
        expect(readable).toContainEqual(condition)
      }

      expect(await pagesRead({ req: { user } } as never)).toEqual({
        and: onTheSite,
      })
    }
    expect(await pagesRead({ req: { user: editor } } as never)).toBe(true)
  })

  it('reads the clock on every request, not once at boot', async () => {
    const first = JSON.stringify(
      await pagesRead({ req: { user: null } } as never),
    )
    vi.setSystemTime(new Date(NOW.getTime() + 60_000))
    const later = JSON.stringify(
      await pagesRead({ req: { user: null } } as never),
    )

    expect(later).not.toBe(first)
  })

  it('keeps raw legacy HTML out of author hands', async () => {
    // The field is rendered with `dangerouslySetInnerHTML`, and an author can
    // create and update their own posts, so an unrestricted field here is
    // stored XSS reachable by the least privileged CMS role.
    const legacyHTML = findField(Posts.fields, 'legacyHTML')
    const access = (legacyHTML as { access?: Record<string, FieldAccess> })
      ?.access

    expect(access?.create).toBeDefined()
    expect(access?.update).toBeDefined()

    for (const check of [access!.create!, access!.update!]) {
      expect(await check({ req: { user: author } } as never)).toBe(false)
      expect(await check({ req: { user: editor } } as never)).toBe(true)
      expect(await check({ req: { user: admin } } as never)).toBe(true)
    }
  })
})

describe('version history access', () => {
  const editor = { id: 2, role: 'editor' as const }
  const author = { id: 3, role: 'author' as const }
  const readVersions = versionsOf(postsRead)

  // Payload reads a version's fields under `version.`, so the document rule
  // has to be rewritten onto them — applied unchanged, `owners` and `_status`
  // name fields a version row does not have.
  it('applies the document rule to the fields each version stored', async () => {
    expect(await readVersions({ req: { user: author } } as never)).toEqual({
      or: [
        {
          and: [
            { 'version._status': { equals: 'published' } },
            {
              or: [
                {
                  'version.publishedAt': {
                    less_than_equal: NOW.toISOString(),
                  },
                },
                { 'version.publishedAt': { exists: false } },
              ],
            },
            { 'version.deletedAt': { exists: false } },
            { 'version.visibility': { equals: 'public' } },
          ],
        },
        { 'version.owners': { equals: author.id } },
      ],
    })
    expect(await readVersions({ req: { user: editor } } as never)).toBe(true)
  })

  // What anonymous requests got before this rule existed. Handing them the
  // published-and-public filter instead would publish every past revision of
  // every public article, which the site has never done.
  it('refuses anonymous requests rather than filtering them', async () => {
    expect(await readVersions({ req: { user: null } } as never)).toBe(false)
    expect(
      await versionsOf(publishedOrEditors)({ req: { user: null } } as never),
    ).toBe(false)
  })

  // Unset, Payload lets any signed-in user read every version of every
  // document, whatever `read` says. A versioned collection added later without
  // this is the same hole again, so the check covers every collection module.
  it('is set on every collection that keeps versions', async () => {
    const dir = resolve(import.meta.dirname, '../../collections')
    const versioned: CollectionConfig[] = []

    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.ts')) continue

      const imported = (await import(resolve(dir, file))) as Record<
        string,
        unknown
      >
      for (const exported of Object.values(imported)) {
        const config = exported as CollectionConfig | null
        if (!config || typeof config !== 'object') continue
        if (typeof config.slug !== 'string' || !config.versions) continue
        versioned.push(config)
      }
    }

    expect(versioned.map((collection) => collection.slug).sort()).toEqual([
      'apps',
      'pages',
      'posts',
      'publications',
    ])
    for (const collection of versioned) {
      expect(collection.access?.readVersions, collection.slug).toBeTypeOf(
        'function',
      )
    }
  })
})
