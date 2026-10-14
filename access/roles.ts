import type { Access, FieldAccess, GlobalConfig, Where } from 'payload'

import { notScheduled, publishedStatus } from '../lib/content/schedule'

export type Role = 'admin' | 'editor' | 'author'

type RequestUser = { id: number | string; role?: Role } | null | undefined

export const isAdmin = (user: RequestUser): boolean => user?.role === 'admin'

export const isEditor = (user: RequestUser): boolean =>
  user?.role === 'admin' || user?.role === 'editor'

export const isAuthenticated = (user: RequestUser): boolean => Boolean(user)

export const adminOnly: Access = ({ req }) => isAdmin(req.user)

export const editorsAndAdmins: Access = ({ req }) => isEditor(req.user)

export const authenticated: Access = ({ req }) => isAuthenticated(req.user)

export const adminField: FieldAccess = ({ req }) => isAdmin(req.user)

export const editorsAndAdminsField: FieldAccess = ({ req }) =>
  isEditor(req.user)

export const publicRead: Access = () => true

/** For collections with no publication date. Posts and pages use `onTheSite`. */
export const publishedOrEditors: Access = ({ req }) =>
  isEditor(req.user) ? true : { _status: { equals: 'published' } }

/**
 * What a reader of the site can see of a dated collection: published, dated
 * today or earlier, and not in the trash.
 *
 * `_status` alone was the rule until 14 Oct 2026, and it was not the rule the
 * site follows. On the CMS hostname the Caddyfile forwards any `/api` request
 * that carries an `Authorization` header, of any value, so a forged header
 * reached Payload as an anonymous caller — and an anonymous caller was handed
 * every *scheduled* post, body and all, weeks before its date. Checked against
 * production rather than assumed: 58 scheduled posts came back. Trash sets
 * `deletedAt` and leaves `_status` alone, so `?trash=true` was the same hole
 * for anything deleted after publication.
 *
 * The site does not depend on this — its reads run with `overrideAccess` and
 * apply `live()` themselves — so this changes what the API gives away, not what
 * the pages render. `publicationsReadFor` applies the same three conditions.
 */
function onTheSite(): Where[] {
  return [publishedStatus, notScheduled(), { deletedAt: { exists: false } }]
}

/** Pages a request may read through the API: what the site would serve. */
export const pagesRead: Access = ({ req }) =>
  isEditor(req.user) ? true : { and: onTheSite() }

/**
 * Posts a request may read through the API.
 *
 * Ghost gated `members` and `paid` posts behind a subscription, so migrated
 * posts that carry those visibilities must not become readable in full just
 * because they are published. The website lists them and serves a teaser, but
 * it renders through `overrideAccess` and withholds the body itself; this rule
 * is what stops an anonymous REST or GraphQL client from fetching the whole
 * document and reading what the page would not show. Nor is a published post
 * readable before its date — see `onTheSite`.
 * Editors see everything; an author additionally sees their own posts.
 */
export const postsRead: Access = ({ req }) => {
  if (isEditor(req.user)) return true

  const publiclyReadable: Where = {
    and: [...onTheSite(), { visibility: { equals: 'public' } }],
  }
  if (!req.user) return publiclyReadable

  const where: Where = {
    or: [publiclyReadable, { owners: { equals: req.user.id } }],
  }
  return where
}

export const ownedPosts: Access = ({ req }) => {
  if (isEditor(req.user)) return true
  if (!req.user) return false
  return { owners: { equals: req.user.id } }
}

export const deleteOwnedDrafts: Access = ({ req }) => {
  if (isEditor(req.user)) return true
  if (!req.user) return false

  const where: Where = {
    and: [
      { owners: { equals: req.user.id } },
      { _status: { equals: 'draft' } },
    ],
  }
  return where
}

/** A document-level `where`, rewritten onto the `version.` fields it has in history. */
function onVersionFields(where: Where): Where {
  return Object.fromEntries(
    Object.entries(where).map(([key, value]) =>
      key === 'and' || key === 'or'
        ? [key, (value as Where[]).map(onVersionFields)]
        : [`version.${key}`, value],
    ),
  ) as Where
}

/**
 * Version history, readable under the same rule as the document it belongs to.
 *
 * Payload does not derive `readVersions` from `read`. Left unset, it lets any
 * signed-in request read every saved version of every document — so an author
 * whom `postsRead` keeps out of a colleague's draft could read that draft, and
 * every earlier revision of it, from `/api/posts/versions`. Checked against a
 * real database rather than assumed: `find` returned nothing, `findVersions`
 * returned both revisions.
 *
 * The document rule's `where` is applied to the fields as each version stored
 * them, which is how Payload itself reads a draft through `read`. Anonymous
 * requests are refused outright rather than given the published-and-public
 * filter, because that is what they got before this rule existed: past
 * revisions are editorial history, not something the site publishes.
 */
export const versionsOf =
  (read: Access): Access =>
  async (args) => {
    if (!args.req.user) return false

    const result = await read(args)
    return typeof result === 'object' ? onVersionFields(result) : result
  }

export const globalPublicReadAdminUpdate: GlobalConfig['access'] = {
  read: () => true,
  update: ({ req }) => isAdmin(req.user),
}
