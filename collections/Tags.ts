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
  // Name, slug, description and search text are per language. A tag archive
  // exists in a language only when the tag has a name and slug there and at
  // least one article published in it (`/es/tag/<slug>/`); otherwise it 404s.
  fields: [
    { name: 'name', type: 'text', required: true, localized: true },
    // `/tag/<slug>`, so an application route cannot be shadowed and the
    // reserved-slug list does not apply — see the note in `fields/slug.ts`.
    slugField({ from: 'name', localized: true }),
    { name: 'description', type: 'textarea', localized: true },
    { name: 'featuredImage', type: 'upload', relationTo: 'media' },
    ...seoFields({ localized: true }),
    ghostIdField(),
  ],
}
