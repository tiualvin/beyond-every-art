import type { CollectionBeforeValidateHook, CollectionConfig } from 'payload'

import { adminOnly, isAdmin } from '../access/roles'

/**
 * "Tell me when this one is ready" signups from `/apps`.
 *
 * Kept apart from `NewsletterSignups` on purpose. That collection is one row
 * per address, and the whole point of this one is that a reader can be waiting
 * on several apps at once — folding them together would mean either losing
 * that or reshaping a collection the newsletter flow already depends on.
 */

/**
 * Payload's `unique` is single-field, and the constraint that matters here is
 * the pair. A reader who ticks Dapple twice has not made a mistake worth an
 * error, so a repeat is answered as a no-op success — the same way the
 * newsletter action treats a duplicate address.
 *
 * This is a courtesy, not the guarantee: two simultaneous submissions can both
 * pass the check. A duplicate row is harmless here (it means one person hears
 * once, from a list that is de-duplicated when it is used), which is why this
 * is a hook rather than a database constraint.
 */
const skipDuplicatePairs: CollectionBeforeValidateHook = async ({
  data,
  operation,
  req,
}) => {
  if (operation !== 'create' || !data?.email || !data?.app) return data

  const existing = await req.payload.find({
    collection: 'app-waitlist',
    where: {
      and: [{ email: { equals: data.email } }, { app: { equals: data.app } }],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  if (existing.totalDocs > 0) {
    throw new DuplicateWaitlistEntry()
  }
  return data
}

/** Thrown by the hook above; the server action reads it as success. */
export class DuplicateWaitlistEntry extends Error {
  constructor() {
    super('Already on the waitlist for this app')
    this.name = 'DuplicateWaitlistEntry'
  }
}

export const AppWaitlist: CollectionConfig = {
  slug: 'app-waitlist',
  labels: { singular: 'App waitlist entry', plural: 'App waitlist' },
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'app', 'createdAt'],
    description: 'Per-app “notify me” signups captured from /apps.',
    group: 'Apps',
    // Admin-only on every operation; see the note in NewsletterSignups.
    hidden: ({ user }) => !isAdmin(user),
  },
  access: {
    // Writes arrive through the /apps server action, which uses
    // overrideAccess. An open `create` would also expose an unauthenticated
    // POST /api/app-waitlist: a spam target, and a way to probe whether an
    // address is already waiting on something.
    create: adminOnly,
    read: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  hooks: { beforeValidate: [skipDuplicatePairs] },
  fields: [
    { name: 'email', type: 'email', required: true, index: true },
    {
      name: 'app',
      type: 'relationship',
      relationTo: 'apps',
      required: true,
      index: true,
    },
    { name: 'source', type: 'text' },
  ],
}
