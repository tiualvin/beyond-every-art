import type { CollectionConfig } from 'payload'

import { adminField, editorsAndAdmins, publicRead } from '../access/roles'

export const Authors: CollectionConfig = {
  slug: 'authors',
  admin: { useAsTitle: 'name' },
  access: {
    create: editorsAndAdmins,
    read: publicRead,
    update: editorsAndAdmins,
    delete: editorsAndAdmins,
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'bio', type: 'textarea' },
    { name: 'profileImage', type: 'upload', relationTo: 'media' },
    { name: 'website', type: 'text' },
    { name: 'ghostID', type: 'text', unique: true, index: true },
    {
      name: 'cmsUser',
      type: 'relationship',
      relationTo: 'users',
      admin: {
        description: 'Private CMS account linked to this public author.',
      },
      access: { read: adminField, create: adminField, update: adminField },
    },
  ],
}
