import type { CollectionConfig } from 'payload'

import { adminField, adminOnly, isAdmin, isEditor } from '../access/roles'

export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  admin: { useAsTitle: 'email' },
  access: {
    create: adminOnly,
    read: ({ req }) => {
      if (isEditor(req.user)) return true
      return req.user ? { id: { equals: req.user.id } } : false
    },
    update: ({ req }) => {
      if (isAdmin(req.user)) return true
      return req.user ? { id: { equals: req.user.id } } : false
    },
    delete: adminOnly,
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'role',
      type: 'select',
      defaultValue: 'author',
      options: ['admin', 'editor', 'author'],
      required: true,
      access: { create: adminField, update: adminField },
    },
    { name: 'bio', type: 'textarea' },
    { name: 'website', type: 'text' },
    { name: 'ghostID', type: 'text', unique: true, index: true },
  ],
}
