import type { CollectionConfig } from 'payload'

import { adminOnly, isAdmin } from '../access/roles'

export const Members: CollectionConfig = {
  slug: 'members',
  admin: {
    group: 'Migration',
    hidden: ({ user }) => !isAdmin(user),
    useAsTitle: 'email',
    description:
      'Restricted preservation copy of Ghost member data. Not an authentication collection.',
  },
  access: {
    create: adminOnly,
    read: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  fields: [
    {
      name: 'ghostID',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    { name: 'email', type: 'email', required: true, unique: true, index: true },
    { name: 'name', type: 'text' },
    { name: 'note', type: 'textarea' },
    {
      name: 'status',
      type: 'select',
      options: ['free', 'paid', 'comped'],
    },
    { name: 'subscribed', type: 'checkbox' },
    { name: 'comped', type: 'checkbox' },
    { name: 'emailCount', type: 'number' },
    { name: 'emailOpenedCount', type: 'number' },
    { name: 'emailOpenRate', type: 'number' },
    { name: 'lastSeenAt', type: 'date' },
    { name: 'ghostCreatedAt', type: 'date' },
    { name: 'ghostUpdatedAt', type: 'date' },
    { name: 'labels', type: 'json' },
    { name: 'newsletters', type: 'json' },
    { name: 'stripeCustomerID', type: 'text', index: true },
    { name: 'stripeSubscriptionID', type: 'text' },
    {
      name: 'rawGhostData',
      type: 'json',
      required: true,
      admin: {
        description:
          'Original member export row for lossless preservation. Never expose publicly.',
      },
    },
  ],
}
