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
//
// **An OAuth connector used to be refused outright, and now is not.** That was
// the right default while no connector had a reason to publish, and it stopped
// being right when the repository owner asked to publish from a phone — the
// case the OAuth layer exists to serve. Reversed deliberately, and narrowly:
// a grant publishes only where the person approving it ticked a box that is
// never pre-ticked, *and* the bound user is an administrator. Two independent
// answers, neither derived from the other, because "may this person publish"
// and "did anybody decide this connector should" are different questions and
// `/oauth/register` is open to anyone. `docs/MCP_OAUTH.md` records the
// reversal and what it costs.

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
   * A connector is still the least supervised client this project has: it runs
   * from a vendor's cloud over content that includes migrated articles an
   * attacker could have influenced. So it is held to a condition an API key is
   * not — `grantMayPublish` — rather than being trusted because of who it acts
   * as.
   */
  viaOAuth?: boolean
  /**
   * Whether this grant's capability record permits publishing.
   *
   * Resolved in `overrideAuth` from the `payload-mcp-api-keys` document the
   * consent screen wrote, so it is per connector and per approval rather than
   * per person. Absent or false for every grant approved before this existed,
   * which is the safe direction: an old connector keeps drafting.
   */
  grantMayPublish?: boolean
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
  grantMayPublish,
}: PublishAttempt): boolean {
  if (payloadAPI !== 'MCP') return true
  if (nextStatus !== 'published') return true
  // Both, not either. The role says the person behind the credential could
  // publish in the admin panel; the capability says somebody decided this
  // particular connector should be able to. A connector approved by an
  // administrator who left the box alone still only drafts.
  if (viaOAuth) return grantMayPublish === true && role === 'admin'
  return role === 'admin'
}

export const refuseMcpPublish: CollectionBeforeChangeHook = ({ data, req }) => {
  // Set by `overrideAuth` when the bearer token resolved to an OAuth grant.
  // `req.context` is the request-scoped bag Payload threads through to hooks,
  // and the MCP tools pass their `req` straight into `payload.create` and
  // `payload.update`, so it arrives here intact.
  const viaOAuth =
    (req.context as { mcpViaOAuth?: unknown } | undefined)?.mcpViaOAuth === true

  const grantMayPublish =
    (req.context as { mcpGrantMayPublish?: unknown } | undefined)
      ?.mcpGrantMayPublish === true

  const allowed = mayPublish({
    nextStatus: (data as { _status?: unknown })?._status,
    payloadAPI: req.payloadAPI,
    role: (req.user as { role?: string } | null | undefined)?.role,
    viaOAuth,
    grantMayPublish,
  })

  if (!allowed) {
    throw new Error(
      viaOAuth
        ? 'This connector may not publish. Publishing is granted per connector, on the ' +
            'consent screen, and only to an administrator. Save the document as a draft and ' +
            'publish it from the admin panel, or reconnect and approve publishing.'
        : 'Publishing through MCP requires an administrator key. Save the document as a draft ' +
            'and publish it from the admin panel.',
    )
  }

  return data
}
