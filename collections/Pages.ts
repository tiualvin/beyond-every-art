import type { CollectionConfig } from 'payload'

import { editorsAndAdmins, publishedOrEditors } from '../access/roles'

export const Pages: CollectionConfig = {
  slug: 'pages',
  admin: { useAsTitle: 'title' },
  access: {
    create: editorsAndAdmins,
    read: publishedOrEditors,
    update: editorsAndAdmins,
    delete: editorsAndAdmins,
  },
  versions: { drafts: true },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'publishedAt', type: 'date' },
    { name: 'content', type: 'richText' },
    { name: 'legacyHTML', type: 'code', admin: { language: 'html' } },
    { name: 'featuredImage', type: 'upload', relationTo: 'media' },
    { name: 'metaTitle', type: 'text' },
    { name: 'metaDescription', type: 'textarea' },
    { name: 'canonicalURL', type: 'text' },
    {
      name: 'ghostID',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
  ],
}
