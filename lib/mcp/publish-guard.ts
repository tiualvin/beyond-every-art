// Who may publish through MCP.
//
// An agent drafting an article and an agent publishing one to the public
// internet are different acts, and Payload's access control cannot tell them
// apart: both are an `update` on a post the user may edit. The MCP endpoint is
// reachable from a vendor's cloud, and an agent that reads a migrated post and
// then writes one is carrying attacker-influenced text between two Payload
// operations — so a draft→published transition is the step worth gating.
//
// The rule: MCP may only publish when its key belongs to an administrator.
// Editor-bound keys draft; a person presses publish in the admin panel, where
// Live Preview shows them what they are about to publish.

import type { CollectionBeforeChangeHook } from 'payload'

export type PublishAttempt = {
  /** Which API the write arrived through. */
  payloadAPI: string | undefined
  /** `_status` the write is trying to set. */
  nextStatus: unknown
  /** Role of the authenticated user. */
  role: string | undefined
  /**
   * Whether the credential was an OAuth grant rather than an API key.
   *
   * OAuth connectors never publish, whatever role they act as. The reasoning is
   * in `docs/MCP_OAUTH.md`: a connector is the least supervised client this
   * project has — it runs from a vendor's cloud, on a schedule nobody watches,
   * over content that includes migrated articles an attacker could have
   * influenced. An API key is held by a person who chose to put it in a config
   * file; a grant is approved once on a phone and then forgotten. Those deserve
   * different answers to "may this publish to the live site", and this is the
   * one place the difference is expressible.
   */
  viaOAuth?: boolean
}

/**
 * Whether a write may set `_status: 'published'`.
 *
 * Everything that is not an MCP request publishing as a non-admin is allowed:
 * the admin panel, the REST and GraphQL APIs, seeds, and the Ghost importer all
 * keep working exactly as before.
 */
export function mayPublish({
  payloadAPI,
  nextStatus,
  role,
  viaOAuth,
}: PublishAttempt): boolean {
  if (payloadAPI !== 'MCP') return true
  if (nextStatus !== 'published') return true
  // Strictly tighter than the key rule, and deliberately not role-dependent:
  // an admin who connects a phone connector has not thereby decided that the
  // connector may publish.
  if (viaOAuth) return false
  return role === 'admin'
}

export const refuseMcpPublish: CollectionBeforeChangeHook = ({ data, req }) => {
  // Set by `overrideAuth` when the bearer token resolved to an OAuth grant.
  // `req.context` is the request-scoped bag Payload threads through to hooks,
  // and the MCP tools pass their `req` straight into `payload.create` and
  // `payload.update`, so it arrives here intact.
  const viaOAuth =
    (req.context as { mcpViaOAuth?: unknown } | undefined)?.mcpViaOAuth === true

  const allowed = mayPublish({
    nextStatus: (data as { _status?: unknown })?._status,
    payloadAPI: req.payloadAPI,
    role: (req.user as { role?: string } | null | undefined)?.role,
    viaOAuth,
  })

  if (!allowed) {
    throw new Error(
      viaOAuth
        ? 'Publishing through an OAuth connector is not permitted. Save the document as a ' +
            'draft and publish it from the admin panel.'
        : 'Publishing through MCP requires an administrator key. Save the document as a draft ' +
            'and publish it from the admin panel.',
    )
  }

  return data
}
