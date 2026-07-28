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
}: PublishAttempt): boolean {
  if (payloadAPI !== 'MCP') return true
  if (nextStatus !== 'published') return true
  return role === 'admin'
}

export const refuseMcpPublish: CollectionBeforeChangeHook = ({ data, req }) => {
  const allowed = mayPublish({
    nextStatus: (data as { _status?: unknown })?._status,
    payloadAPI: req.payloadAPI,
    role: (req.user as { role?: string } | null | undefined)?.role,
  })

  if (!allowed) {
    throw new Error(
      'Publishing through MCP requires an administrator key. Save the document as a draft ' +
        'and publish it from the admin panel.',
    )
  }

  return data
}
