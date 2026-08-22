import type { CollectionConfig } from 'payload'

import { adminOnly, isAdmin } from '../access/roles'

export const NewsletterSignups: CollectionConfig = {
  slug: 'newsletter-signups',
  admin: {
    group: 'Audience',
    // Every operation below is admin-only, so an editor could see the
    // collection in the sidebar and nothing behind it. Hiding it matches
    // Members and Billing events, which made the same call.
    hidden: ({ user }) => !isAdmin(user),
    useAsTitle: 'email',
    defaultColumns: ['email', 'source', 'createdAt'],
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
