import type { CollectionConfig } from 'payload'

export const Posts: CollectionConfig = {
  slug: 'posts',
  admin: { useAsTitle: 'title' },
  access: {
    read: ({ req }) => (req.user ? true : { _status: { equals: 'published' } }),
  },
  versions: { drafts: true },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'publishedAt', type: 'date', index: true },
    { name: 'ghostUpdatedAt', type: 'date' },
    {
      name: 'authors',
      type: 'relationship',
      relationTo: 'authors',
      hasMany: true,
    },
    { name: 'tags', type: 'relationship', relationTo: 'tags', hasMany: true },
    { name: 'featuredImage', type: 'upload', relationTo: 'media' },
    { name: 'excerpt', type: 'textarea' },
    { name: 'content', type: 'richText' },
    { name: 'legacyHTML', type: 'code', admin: { language: 'html' } },
    { name: 'metaTitle', type: 'text' },
    { name: 'metaDescription', type: 'textarea' },
    { name: 'canonicalURL', type: 'text' },
    { name: 'featured', type: 'checkbox', defaultValue: false },
    {
      name: 'visibility',
      type: 'select',
      options: ['public', 'members', 'paid'],
      defaultValue: 'public',
    },
    {
      name: 'ghostID',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    { name: 'ghostURL', type: 'text' },
    {
      name: 'migrationStatus',
      type: 'select',
      options: ['pending', 'migrated', 'conflict', 'failed'],
    },
  ],
}
