import type { CollectionConfig } from 'payload'

import { editorsAndAdmins, publicRead } from '../access/roles'
import { ghostIdField } from '../fields/ghost'
import { seoFields } from '../fields/seo'
import { slugField } from '../fields/slug'
import { CONTENT_TAGS } from '../lib/cache/content'
import { purgeOnChange, purgeOnDelete } from '../lib/cache/purge'

export const Tags: CollectionConfig = {
  slug: 'tags',
  admin: {
    group: 'Content',
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'updatedAt'],
  },
  access: {
    create: editorsAndAdmins,
    read: publicRead,
    update: editorsAndAdmins,
    delete: editorsAndAdmins,
  },
  hooks: {
    afterChange: [purgeOnChange(CONTENT_TAGS.tags)],
    afterDelete: [purgeOnDelete(CONTENT_TAGS.tags)],
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    // `/tag/<slug>`, so an application route cannot be shadowed and the
    // reserved-slug list does not apply — see the note in `fields/slug.ts`.
    slugField({ from: 'name' }),
    { name: 'description', type: 'textarea' },
    { name: 'featuredImage', type: 'upload', relationTo: 'media' },
    ...seoFields(),
    ghostIdField(),
  ],
}
