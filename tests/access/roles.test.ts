import { describe, expect, it } from 'vitest'

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
    expect(await postsRead({ req: { user: null } } as never)).toEqual({
      _status: { equals: 'published' },
    })
    expect(await postsRead({ req: { user: author } } as never)).toEqual({
      or: [
        { _status: { equals: 'published' } },
        { owners: { equals: author.id } },
      ],
    })
    expect(
      await publishedOrEditors({ req: { user: author } } as never),
    ).toEqual({ _status: { equals: 'published' } })
  })
})
