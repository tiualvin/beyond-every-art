// Who may issue an MCP key, and who may take one away.
//
// The plugin ships a deliberately conservative default on
// `payload-mcp-api-keys`: a key binds to whoever created it — the `user` field
// refuses `create` and `update` outright, so its `defaultValue` of "the current
// user" is the only value it can ever hold — and `read`, `update` and `delete`
// are all filtered to `{ user: { equals: req.user.id } }`.
//
// That is a sound default for a project with no roles. Here it collides with
// two decisions already recorded in `docs/MCP_SERVER.md`:
//
//   - **"Bind the first key to an editor, not an admin."** An administrator
//     following the setup steps cannot do it. Every key they create binds to
//     themselves, which is the admin-bound key the document says to avoid, and
//     the capability checkboxes cannot walk that back — an admin-bound key may
//     publish.
//   - **"Revoke by deleting the key document."** An administrator cannot see,
//     let alone delete, a key belonging to anyone else. The one credential on a
//     publicly reachable write endpoint would be revocable only by the person
//     holding it, which is backwards: revocation matters most when that person
//     is unavailable, or is the reason for the revocation.
//
// The plugin's own comments point at this hook as the intended remedy ("Grant
// these via `overrideApiKeyCollection` to let trusted administrators issue keys
// on behalf of other users"), so this takes it up rather than working around
// it. Only access functions change; no field is added, moved, or removed, so
// the database schema is untouched and no migration follows from this file.

import type { Access, CollectionConfig, FieldAccess } from 'payload'

import { isAdmin } from '../../access/roles'

/** A key's owner, however the relationship happens to be stored. */
const ownedByRequestUser = ({ req }: Parameters<Access>[0]) =>
  req.user ? { user: { equals: req.user.id } } : false

/**
 * Keys the request may see and manage.
 *
 * Administrators see every key, because they are the ones who have to revoke
 * one. Everybody else keeps the plugin's own rule and sees only their own — an
 * editor has no reason to read another editor's credential, and the document a
 * key lives in is the credential.
 */
const adminsOrOwnKeys: Access = (args) =>
  isAdmin(args.req.user) ? true : ownedByRequestUser(args)

/**
 * Who may name the user a key acts as, at creation.
 *
 * Administrators only. A key is a standing grant of its user's authority, so
 * this field decides how much authority the key carries — handing it to
 * everyone would let any account mint a key acting as any other. For a
 * non-administrator the field stays refused and the plugin's `defaultValue`
 * binds the key to its creator, which is exactly the old behaviour.
 */
const adminMayBind: FieldAccess = ({ req }) => isAdmin(req.user)

/**
 * Rebinding stays refused, for everyone, forever.
 *
 * Changing `user` on an existing key does not change the key's secret, so the
 * credential already in an agent's configuration would quietly begin acting as
 * somebody else — an editor key becoming an admin key with no new key issued
 * and nothing in the audit log to show for it. Issue a new key and delete the
 * old one; that is a revocation, and it is visible.
 */
const never: FieldAccess = () => false

export function adminIssuableApiKeys(
  collection: CollectionConfig,
): CollectionConfig {
  return {
    ...collection,
    access: {
      ...collection.access,
      delete: adminsOrOwnKeys,
      read: adminsOrOwnKeys,
      unlock: adminsOrOwnKeys,
      update: adminsOrOwnKeys,
    },
    // Narrowed on `type` as well as `name`, because `UIField` also carries a
    // `name` and carries no `access` at all — the compiler is right that the
    // name alone does not identify the relationship field.
    fields: collection.fields.map((field) =>
      field.type === 'relationship' && field.name === 'user'
        ? {
            ...field,
            access: {
              ...field.access,
              create: adminMayBind,
              update: never,
            },
          }
        : field,
    ),
  }
}
