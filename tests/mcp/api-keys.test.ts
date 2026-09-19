import type { CollectionConfig, RelationshipField } from 'payload'
import { describe, expect, it } from 'vitest'

import {
  adminIssuableApiKeys,
  PUBLISH_FIELD,
  PUBLISH_OPERATION,
} from '../../lib/mcp/api-keys'

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

  // This used to assert that no field was added at all, which was true until
  // publishing became a per-connector capability. The invariant worth keeping
  // is narrower and still worth a test: exactly one field is added, it is that
  // capability, and nothing the plugin shipped is removed or reordered — so a
  // future edit here cannot quietly drop a capability checkbox and take a
  // column with it.
  it('adds the publish capability and removes nothing', () => {
    const before = pluginCollection()
    const after = adminIssuableApiKeys(before)

    const names = (collection: { fields: unknown[] }) =>
      collection.fields.map((field) =>
        field && typeof field === 'object' && 'name' in field
          ? (field as { name?: unknown }).name
          : null,
      )

    expect(names(after)).toEqual([...names(before), PUBLISH_FIELD])
  })

  it('leaves that capability off unless somebody turns it on', () => {
    const added = adminIssuableApiKeys(pluginCollection()).fields.at(-1) as {
      name?: string
      fields?: Array<{ name?: string; defaultValue?: unknown }>
    }

    expect(added.name).toBe(PUBLISH_FIELD)
    expect(added.fields?.[0]?.name).toBe(PUBLISH_OPERATION)
    // The whole safety of an open registration endpoint rests on this default.
    expect(added.fields?.[0]?.defaultValue).toBe(false)
  })
})
