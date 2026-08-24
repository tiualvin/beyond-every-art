import type { CollectionConfig } from 'payload'

import { adminField, editorsAndAdmins, publicRead } from '../access/roles'
import { ghostIdField } from '../fields/ghost'
import { slugField } from '../fields/slug'
import { CONTENT_TAGS } from '../lib/cache/content'
import { purgeOnChange, purgeOnDelete } from '../lib/cache/purge'

export const Authors: CollectionConfig = {
  slug: 'authors',
  admin: {
    group: 'Content',
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'updatedAt'],
    description:
      'Public bylines. Separate from Users, which are CMS accounts — one person can be both, linked below.',
  },
  access: {
    create: editorsAndAdmins,
    read: publicRead,
    update: editorsAndAdmins,
    delete: editorsAndAdmins,
  },
  hooks: {
    afterChange: [purgeOnChange(CONTENT_TAGS.authors)],
    afterDelete: [purgeOnDelete(CONTENT_TAGS.authors)],
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    // `/author/<slug>`; see the note on Tags.
    slugField({ from: 'name' }),
    { name: 'bio', type: 'textarea' },
    { name: 'profileImage', type: 'upload', relationTo: 'media' },
    { name: 'website', type: 'text' },
    ghostIdField(),
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
