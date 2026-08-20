// MCP clients that have registered themselves.
//
// One document per `client_id` handed out by `POST /oauth/register`. Nothing
// here is a credential: registration produces no client secret, because every
// client in this flow is a public client that proves itself with PKCE instead
// (see `lib/oauth/metadata.ts` for why). So a document is an identity and a set
// of redirect URIs, and the only thing that matters about it is that the URIs
// cannot be edited into something that would receive somebody else's code.
//
// Writes happen only through the registration endpoint, under `overrideAccess`.
// Nothing in the admin panel may create or edit one — a redirect URI changed
// after the fact is an open redirect on a live grant.

import type { CollectionConfig } from 'payload'

import { adminOnly } from '../access/roles'

export const OAuthClients: CollectionConfig = {
  slug: 'oauth-clients',
  admin: {
    group: 'MCP',
    useAsTitle: 'clientName',
    description:
      'MCP clients registered through OAuth dynamic client registration. ' +
      'Read-only: delete one to stop it starting new authorizations.',
    defaultColumns: ['clientName', 'clientId', 'createdAt'],
  },
  access: {
    // Registration is the only way in, and it runs server-side with
    // `overrideAccess`. An administrator may look and may delete; nobody edits.
    create: () => false,
    update: () => false,
    read: adminOnly,
    delete: adminOnly,
  },
  labels: { singular: 'OAuth Client', plural: 'OAuth Clients' },
  fields: [
    {
      name: 'clientId',
      label: 'Client ID',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: { readOnly: true },
    },
    {
      name: 'clientName',
      type: 'text',
      required: true,
      admin: {
        readOnly: true,
        description:
          'Supplied by the client at registration. Not verified — treat it as a ' +
          'label the client chose for itself, never as proof of who it is.',
      },
    },
    {
      // JSON rather than an array field: an array would be a second table and a
      // second migration for a list this server only ever reads whole, compares
      // by exact string, and never queries into.
      name: 'redirectUris',
      label: 'Redirect URIs',
      type: 'json',
      required: true,
      admin: { readOnly: true },
    },
  ],
}
