import type { CollectionConfig } from 'payload'

import { editorsAndAdmins, publicRead } from '../access/roles'
import { CONTENT_TAGS } from '../lib/cache/content'
import { purgeOnChange, purgeOnDelete } from '../lib/cache/purge'

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    create: editorsAndAdmins,
    read: publicRead,
    update: editorsAndAdmins,
    delete: editorsAndAdmins,
  },
  hooks: {
    afterChange: [purgeOnChange(CONTENT_TAGS.media)],
    afterDelete: [purgeOnDelete(CONTENT_TAGS.media)],
  },
  upload: {
    mimeTypes: ['image/*'],
    imageSizes: [{ name: 'card', width: 768, withoutEnlargement: true }],
  },
  fields: [
    { name: 'alt', type: 'text', required: true },
    { name: 'caption', type: 'textarea' },
    { name: 'credit', type: 'text' },
    {
      name: 'aiGenerated',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      admin: {
        description:
          'Set when the image was generated rather than photographed or ' +
          'drawn. This publication writes about specific works and materials, ' +
          'so which pictures are synthetic is a question that has to stay ' +
          'answerable — filter on this to find them.',
      },
    },
    { name: 'ghostURL', type: 'text', unique: true, index: true },
    {
      name: 'migrationStatus',
      type: 'select',
      options: ['pending', 'migrated', 'failed'],
    },
  ],
}
