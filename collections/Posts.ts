import type { CollectionConfig } from 'payload'

import {
  authenticated,
  deleteOwnedDrafts,
  editorsAndAdminsField,
  ownedPosts,
  postsRead,
} from '../access/roles'

export const Posts: CollectionConfig = {
  slug: 'posts',
  admin: { useAsTitle: 'title' },
  access: {
    create: authenticated,
    read: postsRead,
    update: ownedPosts,
    delete: deleteOwnedDrafts,
  },
  hooks: {
    beforeChange: [
      ({ data, operation, req }) => {
        if (operation === 'create' && req.user?.role === 'author') {
          return { ...data, owners: [req.user.id] }
        }
        return data
      },
    ],
  },
  versions: { drafts: true },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'publishedAt', type: 'date', index: true },
    { name: 'ghostUpdatedAt', type: 'date' },
    {
      name: 'owners',
      type: 'relationship',
      relationTo: 'users',
      hasMany: true,
      admin: {
        description: 'Private CMS editing ownership; not a public byline.',
      },
      access: {
        read: editorsAndAdminsField,
        create: editorsAndAdminsField,
        update: editorsAndAdminsField,
      },
    },
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
