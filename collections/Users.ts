import type { CollectionConfig } from 'payload'

export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  admin: { useAsTitle: 'email' },
  access: {
    create: ({ req }) => !req.user,
    read: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => req.user?.role === 'admin',
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'role',
      type: 'select',
      defaultValue: 'author',
      options: ['admin', 'editor', 'author'],
      required: true,
    },
    { name: 'bio', type: 'textarea' },
    { name: 'website', type: 'text' },
    { name: 'ghostID', type: 'text', unique: true, index: true },
  ],
}
