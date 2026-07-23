import type { CollectionConfig } from 'payload'

export const Authors: CollectionConfig = {
  slug: 'authors',
  admin: { useAsTitle: 'name' },
  access: { read: () => true },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'bio', type: 'textarea' },
    { name: 'profileImage', type: 'upload', relationTo: 'media' },
    { name: 'website', type: 'text' },
    { name: 'ghostID', type: 'text', unique: true, index: true },
  ],
}
