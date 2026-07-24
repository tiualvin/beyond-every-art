import type { CollectionConfig } from 'payload'

import { editorsAndAdmins } from '../access/roles'

export const Redirects: CollectionConfig = {
  slug: 'redirects',
  admin: { useAsTitle: 'source' },
  access: {
    create: editorsAndAdmins,
    read: editorsAndAdmins,
    update: editorsAndAdmins,
    delete: editorsAndAdmins,
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
