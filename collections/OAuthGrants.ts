// One document per authorization a person has granted to a client.
//
// It carries the whole lifecycle: it is created holding an authorization code,
// the token endpoint trades that code for tokens on the same document, and a
// refresh rotates them in place. So "which connectors can reach my content" is
// one listing, and revoking is deleting a row.
//
// **No secret is stored here.** The code and both tokens are kept as HMACs
// under `PAYLOAD_SECRET` (`lib/oauth/tokens.ts`), so this table leaking gives an
// attacker nothing to present, and rotating that secret invalidates every grant.
//
// **None of the three relationships is `required`, and that is load-bearing
// rather than lax.** Payload generates them as `ON DELETE SET NULL`, so a
// `NOT NULL` column would make deleting the referenced row fail outright: an
// administrator revoking a connector by deleting its capability record would
// get a foreign-key error instead of a revocation. Nullable, the delete
// succeeds, the grant is left pointing at nothing, and `resolveAccessToken`
// refuses it — which is exactly the intended meaning of "the record that said
// what this connector may do is gone".
//
// Capabilities are deliberately *not* stored here. They live on the
// `payload-mcp-api-keys` document this grant points at, which is the same record
// type an API key uses — so the capability checkboxes, the publish guard, the
// audit log, and revoke-by-delete all work on an OAuth connector exactly as they
// already do on a key, with no second implementation to keep in step.

import type { CollectionConfig } from 'payload'

import { isAdmin } from '../access/roles'

export const OAuthGrants: CollectionConfig = {
  slug: 'oauth-grants',
  admin: {
    group: 'MCP',
    useAsTitle: 'label',
    description:
      'Live OAuth authorizations. Delete one to disconnect that client ' +
      'immediately; its tokens stop resolving on the next request.',
    defaultColumns: ['label', 'user', 'revoked', 'updatedAt'],
  },
  access: {
    // Written only by the authorize and token endpoints, under `overrideAccess`.
    create: () => false,
    update: () => false,
    // An administrator sees every grant, because they are the one who has to
    // revoke a connector nobody else can reach. Everyone else sees their own.
    read: ({ req }) =>
      isAdmin(req.user)
        ? true
        : req.user
          ? { user: { equals: req.user.id } }
          : false,
    delete: ({ req }) =>
      isAdmin(req.user)
        ? true
        : req.user
          ? { user: { equals: req.user.id } }
          : false,
  },
  labels: { singular: 'OAuth Grant', plural: 'OAuth Grants' },
  fields: [
    {
      name: 'label',
      type: 'text',
      required: true,
      admin: {
        readOnly: true,
        description: 'The client, and who approved it.',
      },
    },
    {
      name: 'client',
      type: 'relationship',
      relationTo: 'oauth-clients',
      admin: { readOnly: true },
    },
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      admin: {
        readOnly: true,
        description: 'The Payload user this grant acts as.',
      },
    },
    {
      name: 'apiKey',
      label: 'API Key',
      type: 'relationship',
      relationTo: 'payload-mcp-api-keys',
      admin: {
        readOnly: true,
        description:
          'The capability record this grant resolves to. Deleting it revokes ' +
          'the grant, because there is then nothing left to say what it may do.',
      },
    },
    {
      name: 'redirectUri',
      label: 'Redirect URI',
      type: 'text',
      required: true,
      admin: { readOnly: true },
    },
    // --- authorization code, single use and short lived ---
    { name: 'codeHash', type: 'text', index: true, admin: { readOnly: true } },
    { name: 'codeChallenge', type: 'text', admin: { readOnly: true } },
    { name: 'codeExpiresAt', type: 'date', admin: { readOnly: true } },
    {
      name: 'codeRedeemed',
      type: 'checkbox',
      defaultValue: false,
      admin: { readOnly: true },
    },
    // --- tokens ---
    {
      name: 'accessTokenHash',
      type: 'text',
      index: true,
      admin: { readOnly: true },
    },
    { name: 'accessTokenExpiresAt', type: 'date', admin: { readOnly: true } },
    {
      name: 'refreshTokenHash',
      type: 'text',
      index: true,
      admin: { readOnly: true },
    },
    { name: 'refreshTokenExpiresAt', type: 'date', admin: { readOnly: true } },
    {
      name: 'revoked',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      admin: {
        readOnly: true,
        description:
          'Set when a refresh token is replayed, which is the signature of a ' +
          'stolen token — see `lib/oauth/grants.ts`.',
      },
    },
  ],
}
