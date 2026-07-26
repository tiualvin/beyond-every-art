import type { FieldAccess } from 'payload'
import { describe, expect, it } from 'vitest'

import { Posts } from '../../collections/Posts'
import {
  deleteOwnedDrafts,
  isAdmin,
  isAuthenticated,
  isEditor,
  ownedPosts,
  postsRead,
  publishedOrEditors,
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
    const legacyHTML = Posts.fields.find(
      (field) => 'name' in field && field.name === 'legacyHTML',
    )
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
