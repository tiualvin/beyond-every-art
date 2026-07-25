import type { CollectionConfig } from 'payload'

import { adminOnly } from '../access/roles'

export const NewsletterSignups: CollectionConfig = {
  slug: 'newsletter-signups',
  admin: {
    useAsTitle: 'email',
    description: 'Email signups captured from the public /newsletter page.',
  },
  access: {
    // Signups arrive through the /newsletter server action, which writes with
    // overrideAccess. Leaving `create` open would also expose an unauthenticated
    // POST /api/newsletter-signups endpoint: an open spam target, and a way to
    // probe whether an address is already subscribed via the unique-key error.
    create: adminOnly,
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
