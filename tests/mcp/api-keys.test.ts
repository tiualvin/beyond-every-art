import type { CollectionConfig, RelationshipField } from 'payload'
import { describe, expect, it } from 'vitest'

import { adminIssuableApiKeys } from '../../lib/mcp/api-keys'

/** The shape of the plugin's collection, reduced to what this file changes. */
const pluginCollection = (): CollectionConfig =>
  ({
    slug: 'payload-mcp-api-keys',
    access: {
      create: () => true,
      delete: () => false,
      read: () => false,
      unlock: () => false,
      update: () => false,
    },
    fields: [
      {
        name: 'user',
        type: 'relationship',
        access: { create: () => false, update: () => false },
        relationTo: 'users',
        required: true,
      },
      { name: 'label', type: 'text' },
    ],
  }) as CollectionConfig

const request = (user: unknown) =>
  ({ req: { user } }) as unknown as Parameters<
    NonNullable<NonNullable<CollectionConfig['access']>['read']>
  >[0]

const userField = (collection: CollectionConfig): RelationshipField =>
  collection.fields.find(
    (field) => field.type === 'relationship' && field.name === 'user',
  ) as RelationshipField

describe('adminIssuableApiKeys', () => {
  // The revocation half. `docs/MCP_SERVER.md` says to revoke a key by deleting
  // its document; the plugin's default hides other people's keys from everyone,
  // so an administrator could not do it — which is backwards, since revocation
  // matters most when the key's holder is unavailable or is the reason for it.
  it('lets an administrator read and delete any key', () => {
    const { access } = adminIssuableApiKeys(pluginCollection())
    const admin = request({ id: 1, role: 'admin' })

    expect(access?.read?.(admin)).toBe(true)
    expect(access?.delete?.(admin)).toBe(true)
    expect(access?.update?.(admin)).toBe(true)
  })

  it('still shows an editor only their own keys', () => {
    const { access } = adminIssuableApiKeys(pluginCollection())
    const editor = request({ id: 7, role: 'editor' })

    expect(access?.read?.(editor)).toEqual({ user: { equals: 7 } })
    expect(access?.delete?.(editor)).toEqual({ user: { equals: 7 } })
  })

  it('shows an anonymous request nothing', () => {
    const { access } = adminIssuableApiKeys(pluginCollection())
    expect(access?.read?.(request(null))).toBe(false)
  })

  // The issuance half. Decision 1 in the document is "bind the first key to an
  // editor, not an admin", and the plugin's default made that impossible: every
  // key bound to whoever created it, so an administrator could only ever mint
  // an admin-bound key — one permitted to publish.
  it('lets an administrator bind a new key to another user', () => {
    const field = userField(adminIssuableApiKeys(pluginCollection()))
    expect(field.access?.create?.(request({ id: 1, role: 'admin' }))).toBe(true)
  })

  it('leaves a non-administrator bound to themselves', () => {
    const field = userField(adminIssuableApiKeys(pluginCollection()))
    expect(field.access?.create?.(request({ id: 7, role: 'editor' }))).toBe(
      false,
    )
  })

  // Rebinding would move a live credential's authority without issuing a new
  // key or leaving a trace: the agent keeps the same secret and starts acting
  // as somebody else. Issue and revoke instead.
  it('refuses to rebind an existing key, even for an administrator', () => {
    const field = userField(adminIssuableApiKeys(pluginCollection()))
    expect(field.access?.update?.(request({ id: 1, role: 'admin' }))).toBe(
      false,
    )
  })

  it('adds and removes no field, so the schema is unchanged', () => {
    const before = pluginCollection()
    const after = adminIssuableApiKeys(before)

    expect(
      after.fields.map((field) => ('name' in field ? field.name : null)),
    ).toEqual(
      before.fields.map((field) => ('name' in field ? field.name : null)),
    )
  })
})
