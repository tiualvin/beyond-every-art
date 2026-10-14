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

import type {
  CollectionBeforeChangeHook,
  CollectionBeforeOperationHook,
  PayloadRequest,
} from 'payload'

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

/** The request half of a publish attempt: who is asking, and through what. */
function attemptFrom(req: PayloadRequest): Omit<PublishAttempt, 'nextStatus'> {
  // Set by `overrideAuth` when the bearer token resolved to an OAuth grant.
  // `req.context` is the request-scoped bag Payload threads through to hooks,
  // and the MCP tools pass their `req` straight into `payload.create` and
  // `payload.update`, so it arrives here intact.
  const context = req.context as
    { mcpViaOAuth?: unknown; mcpGrantMayPublish?: unknown } | undefined

  return {
    payloadAPI: req.payloadAPI,
    role: (req.user as { role?: string } | null | undefined)?.role,
    viaOAuth: context?.mcpViaOAuth === true,
    grantMayPublish: context?.mcpGrantMayPublish === true,
  }
}

/**
 * Whether this request could publish, asked before trying.
 *
 * The same rule `refuseMcpPublish` enforces, so a tool can tell its caller up
 * front — a dry run from a phone should not have to attempt a publish to find
 * out the connector was never granted one.
 */
export function mayPublishThrough(req: PayloadRequest): boolean {
  return mayPublish({ ...attemptFrom(req), nextStatus: 'published' })
}

export const refuseMcpPublish: CollectionBeforeChangeHook = ({ data, req }) => {
  const attempt = attemptFrom(req)
  const { viaOAuth } = attempt
  const allowed = mayPublish({
    ...attempt,
    nextStatus: (data as { _status?: unknown })?._status,
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

/**
 * An MCP write that is not a publish is a draft save, whatever the call asked;
 * and a publish goes one article at a time.
 *
 * Payload fills every field a write leaves out from the article's newest
 * version — `_status` among them. When the newest version is a draft sitting
 * over a live article, which is what every agent revision of a published post
 * is, a write that sets one field and no `draft` flag writes the *live row* with
 * `_status: 'draft'`, and the article leaves the site. The plugin's
 * `updatePosts` defaults `draft` to false, so setting a featured image or a tag
 * the obvious way was enough. `refuseMcpPublish` could not see it: it guards
 * the step *to* published, and this was a step away from it, by any key.
 * Reproduced against a real database on 14 Oct 2026 with an editor key setting
 * only an excerpt, while twenty live articles carried exactly such drafts.
 *
 * So the one MCP write that touches the live row is an explicit publish, which
 * `refuseMcpPublish` then decides. Everything else — an image, tags, a date, an
 * explicit `_status: 'draft'` — lands as a draft over the live article, which
 * is what drafting means. Taking an article off the site is a person's
 * decision, made in the admin panel.
 *
 * A `beforeOperation` hook because that is the last point the `draft` argument
 * can still be changed: `beforeChange` sees the data after Payload has already
 * decided which row the write goes to.
 */
export const keepMcpWritesInDraft: CollectionBeforeOperationHook = ({
  args,
  operation,
  req,
}) => {
  if (operation !== 'update' || req.payloadAPI !== 'MCP') return args

  const update = args as {
    data?: { _status?: unknown }
    draft?: boolean
    id?: unknown
  }
  if (update.draft === true) return args

  if (update.data?._status === 'published') {
    // A publish by `where` rather than by id is completed from the *live row*,
    // not the newest version — Payload's bulk update reads the main table —
    // so it publishes the older text and quietly buries the newer draft. By id
    // it promotes the newest version, as the admin panel does. Refused for a
    // caller who could publish; one who could not is left to
    // `refuseMcpPublish`, whose refusal says why.
    if (update.id === undefined && mayPublishThrough(req)) {
      throw new Error(
        'Publish one article at a time, by id or slug, with `publishArticle`. ' +
          'A publish by `where` is completed from the live version rather ' +
          'than the newest draft, so it would publish older text and discard ' +
          'the revision.',
      )
    }
    return args
  }

  return { ...args, draft: true }
}
