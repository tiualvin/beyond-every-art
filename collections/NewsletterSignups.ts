import type { CollectionConfig } from 'payload'

import { adminOnly } from '../access/roles'

export const NewsletterSignups: CollectionConfig = {
  slug: 'newsletter-signups',
  admin: {
    useAsTitle: 'email',
    description: 'Email signups captured from the public /newsletter page.',
  },
  access: {
    create: () => true,
    read: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  fields: [
    {
      name: 'email',
      type: 'email',
      required: true,
      unique: true,
      index: true,
    },
    { name: 'source', type: 'text' },
  ],
}
