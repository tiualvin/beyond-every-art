import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import type { CollectionConfig, FieldAccess } from 'payload'
import { describe, expect, it } from 'vitest'

import { Posts } from '../../collections/Posts'
import { findField } from '../support/fields'
import {
  deleteOwnedDrafts,
  isAdmin,
  isAuthenticated,
  isEditor,
  ownedPosts,
  postsRead,
  publishedOrEditors,
  versionsOf,
} from '../../access/roles'

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
      and: [
        { _status: { equals: 'published' } },
        { visibility: { equals: 'public' } },
      ],
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
