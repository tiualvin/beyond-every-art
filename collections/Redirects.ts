import type { CollectionConfig } from 'payload'

export const Redirects: CollectionConfig = {
  slug: 'redirects',
  admin: { useAsTitle: 'source' },
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
