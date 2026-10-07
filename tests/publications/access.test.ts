import type { Where } from 'payload'
import { describe, expect, it } from 'vitest'

import {
  publicationsRead,
  publicationsReadFor,
} from '../../access/publications'
import { editorsAndAdmins } from '../../access/roles'
import { Publications } from '../../collections/Publications'

const anonymous = { req: { user: null } } as never
const author = { req: { user: { id: 3, role: 'author' } } } as never
const editor = { req: { user: { id: 2, role: 'editor' } } } as never
const admin = { req: { user: { id: 1, role: 'admin' } } } as never

describe('publicationsReadFor, before launch', () => {
  const read = publicationsReadFor(false)

  it('refuses everyone but editors, published or not', async () => {
    // The CMS hostname forwards any /api request carrying an Authorization
    // header, so "anonymous" here includes a client that sent a junk one.
    expect(await read(anonymous)).toBe(false)
    expect(await read(author)).toBe(false)
  })

  it('lets editors read everything, for the admin and for preview', async () => {
    expect(await read(editor)).toBe(true)
    expect(await read(admin)).toBe(true)
  })
})

describe('publicationsReadFor, after launch', () => {
  const read = publicationsReadFor(true)

  it('gives a reader what the site would show', async () => {
    const where = (await read(anonymous)) as Where
    const conditions = JSON.stringify(where)
    // Published, not dated in the future, and not in the trash.
    expect(conditions).toContain('"_status":{"equals":"published"}')
    expect(conditions).toContain('"publishedAt":{"less_than_equal"')
    expect(conditions).toContain('"deletedAt":{"exists":false}')
  })

  it('treats a signed-in author as a reader', async () => {
    expect(typeof (await read(author))).toBe('object')
  })

  it('still lets editors read everything', async () => {
    expect(await read(editor)).toBe(true)
  })
})

describe('the Publications collection', () => {
  it('reads through the launch-aware rule', () => {
    expect(Publications.access?.read).toBe(publicationsRead)
  })

  it('keeps version history to editors', () => {
    // versionsOf(read) would judge each revision by its own stored status, so
    // an author could read revisions of an issue that has since been withdrawn.
    expect(Publications.access?.readVersions).toBe(editorsAndAdmins)
  })
})
