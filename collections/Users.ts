import type { CollectionConfig } from 'payload'

import { adminField, adminOnly, isAdmin, isEditor } from '../access/roles'

export const Users: CollectionConfig = {
  slug: 'users',
  auth: {
    // Payload's cookie defaults are `sameSite: 'Lax'` and `secure: false`, and
    // the second one is worth overriding: without it the cookie that
    // authenticates every administrator is sent without the `Secure`
    // attribute, so a single plaintext request to this host — a typed URL, a
    // stale bookmark, a link from an http page — puts a live admin session on
    // the wire. HSTS makes that hard to provoke; the flag makes it impossible
    // for the cookie to leave over http at all.
    //
    // Only outside development, where the site is served over plain http and a
    // `Secure` cookie would simply never be stored, breaking login locally.
    cookies: { secure: process.env.NODE_ENV === 'production' },
  },
  admin: {
    group: 'System',
    useAsTitle: 'email',
    defaultColumns: ['name', 'email', 'role'],
  },
  access: {
    create: adminOnly,
    read: ({ req }) => {
      if (isEditor(req.user)) return true
      return req.user ? { id: { equals: req.user.id } } : false
    },
    update: ({ req }) => {
      if (isAdmin(req.user)) return true
      return req.user ? { id: { equals: req.user.id } } : false
    },
    delete: adminOnly,
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'role',
      type: 'select',
      defaultValue: 'author',
      options: ['admin', 'editor', 'author'],
      required: true,
      access: { create: adminField, update: adminField },
    },
    { name: 'bio', type: 'textarea' },
    { name: 'website', type: 'text' },
    {
      name: 'ghostID',
      label: 'Ghost ID',
      type: 'text',
      unique: true,
      index: true,
    },
  ],
}
