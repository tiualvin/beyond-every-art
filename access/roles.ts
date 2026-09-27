import type { Access, FieldAccess, GlobalConfig, Where } from 'payload'

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

export const publishedOrEditors: Access = ({ req }) =>
  isEditor(req.user) ? true : { _status: { equals: 'published' } }

/**
 * Posts a request may read through the API.
 *
 * Ghost gated `members` and `paid` posts behind a subscription, so migrated
 * posts that carry those visibilities must not become readable in full just
 * because they are published. The website lists them and serves a teaser, but
 * it renders through `overrideAccess` and withholds the body itself; this rule
 * is what stops an anonymous REST or GraphQL client from fetching the whole
 * document and reading what the page would not show.
 * Editors see everything; an author additionally sees their own posts.
 */
export const postsRead: Access = ({ req }) => {
  if (isEditor(req.user)) return true

  const publiclyReadable: Where = {
    and: [
      { _status: { equals: 'published' } },
      { visibility: { equals: 'public' } },
    ],
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
