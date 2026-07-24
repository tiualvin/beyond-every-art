import type { Access, FieldAccess, GlobalConfig } from 'payload'

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

export const postsRead: Access = ({ req }) => {
  if (isEditor(req.user)) return true
  if (!req.user) return { _status: { equals: 'published' } }

  return {
    or: [
      { _status: { equals: 'published' } },
      { owners: { equals: req.user.id } },
    ],
  }
}

export const ownedPosts: Access = ({ req }) => {
  if (isEditor(req.user)) return true
  if (!req.user) return false
  return { owners: { equals: req.user.id } }
}

export const deleteOwnedDrafts: Access = ({ req }) => {
  if (isEditor(req.user)) return true
  if (!req.user) return false
  return {
    and: [
      { owners: { equals: req.user.id } },
      { _status: { equals: 'draft' } },
    ],
  }
}

export const globalPublicReadAdminUpdate: GlobalConfig['access'] = {
  read: () => true,
  update: ({ req }) => isAdmin(req.user),
}
