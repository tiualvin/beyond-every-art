import type { CollectionConfig } from 'payload'

import { editorsAndAdmins } from '../access/roles'
import { CONTENT_TAGS } from '../lib/cache/content'
import { purgeOnChange, purgeOnDelete } from '../lib/cache/purge'

export const Redirects: CollectionConfig = {
  slug: 'redirects',
  admin: {
    group: 'SEO',
    useAsTitle: 'source',
    defaultColumns: ['source', 'destination', 'statusCode', 'enabled'],
  },
  access: {
    create: editorsAndAdmins,
    read: editorsAndAdmins,
    update: editorsAndAdmins,
    delete: editorsAndAdmins,
  },
  // `/redirects-map` caches this collection now, so an edit has to say so —
  // without these a new redirect would sit unapplied until the cache expired,
  // which is the wrong trade for the one piece of content whose whole purpose
  // is to take effect immediately.
  hooks: {
    afterChange: [purgeOnChange(CONTENT_TAGS.redirects)],
    afterDelete: [purgeOnDelete(CONTENT_TAGS.redirects)],
  },
  fields: [
    { name: 'source', type: 'text', required: true, unique: true },
    { name: 'destination', type: 'text', required: true },
    {
      name: 'statusCode',
      type: 'select',
      defaultValue: '301',
      options: ['301', '302', '307', '308'],
      required: true,
    },
    { name: 'enabled', type: 'checkbox', defaultValue: true },
    { name: 'notes', type: 'textarea' },
  ],
}
