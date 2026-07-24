import type { CollectionConfig } from 'payload'

import { editorsAndAdmins, publicRead } from '../access/roles'

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    create: editorsAndAdmins,
    read: publicRead,
    update: editorsAndAdmins,
    delete: editorsAndAdmins,
  },
  upload: {
    mimeTypes: ['image/*'],
    imageSizes: [{ name: 'card', width: 768, withoutEnlargement: true }],
  },
  fields: [
    { name: 'alt', type: 'text', required: true },
    { name: 'caption', type: 'textarea' },
    { name: 'credit', type: 'text' },
    { name: 'ghostURL', type: 'text', unique: true, index: true },
    {
      name: 'migrationStatus',
      type: 'select',
      options: ['pending', 'migrated', 'failed'],
    },
  ],
}
