import type { CollectionConfig } from 'payload'

import { editorsAndAdmins, publicRead } from '../access/roles'
import { CONTENT_TAGS } from '../lib/cache/content'
import { purgeOnChange, purgeOnDelete } from '../lib/cache/purge'
import { refuseOversizedUpload } from '../lib/security/uploads'

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    create: editorsAndAdmins,
    read: publicRead,
    update: editorsAndAdmins,
    delete: editorsAndAdmins,
  },
  hooks: {
    beforeOperation: [refuseOversizedUpload],
    afterChange: [purgeOnChange(CONTENT_TAGS.media)],
    afterDelete: [purgeOnDelete(CONTENT_TAGS.media)],
  },
  upload: {
    // Listed one by one rather than as `image/*`, which matches
    // `image/svg+xml`. An SVG is a document that can carry script, and uploads
    // are served from `/api/media/file/<name>` on the site's own origin, so
    // accepting one is accepting same-origin script from whoever uploaded it.
    //
    // The MCP upload tool already refused SVG by sniffing magic bytes
    // (lib/mcp/upload.ts) and noted that the collection itself still allowed it
    // through the admin panel. This closes that half. Editors can already write
    // raw `legacyHTML`, so this is not a new trust boundary — it is removing a
    // second, quieter way to reach the same place, one that survives a future
    // decision to widen who may upload.
    mimeTypes: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/avif',
    ],
    // No size ceiling is set here because Payload v3's `UploadConfig` has no
    // option for one — `filesize` belongs to the stored file's metadata, not to
    // the collection's rules. The ceiling is enforced by `refuseOversizedUpload`
    // in the hooks above instead, which runs before Payload reads the file, so
    // nothing oversized reaches disk or sharp.
    //
    // That bounds what gets stored, not what a stranger can make this server
    // receive: the bytes have already arrived by the time a hook runs. A request
    // body limit in front of the application is still the real defence, and is
    // recorded in docs/EDGE_PROTECTION.md as unfinished rather than left to be
    // rediscovered.
    imageSizes: [{ name: 'card', width: 768, withoutEnlargement: true }],
  },
  fields: [
    { name: 'alt', type: 'text', required: true },
    { name: 'caption', type: 'textarea' },
    { name: 'credit', type: 'text' },
    {
      name: 'aiGenerated',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      admin: {
        description:
          'Set when the image was generated rather than photographed or ' +
          'drawn. This publication writes about specific works and materials, ' +
          'so which pictures are synthetic is a question that has to stay ' +
          'answerable — filter on this to find them.',
      },
    },
    { name: 'ghostURL', type: 'text', unique: true, index: true },
    {
      name: 'migrationStatus',
      type: 'select',
      options: ['pending', 'migrated', 'failed'],
    },
  ],
}
