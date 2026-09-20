import type { CollectionConfig } from 'payload'

import { editorsAndAdmins, publicRead } from '../access/roles'
import { toCreditURL } from '../lib/content/attribution'
import { ghostUrlField, migrationStatusField } from '../fields/ghost'
import { CONTENT_TAGS } from '../lib/cache/content'
import { purgeOnChange, purgeOnDelete } from '../lib/cache/purge'
import { refuseOversizedUpload } from '../lib/security/uploads'

export const Media: CollectionConfig = {
  slug: 'media',
  admin: {
    group: 'Content',
    useAsTitle: 'filename',
    defaultColumns: ['filename', 'alt', 'aiGenerated', 'updatedAt'],
  },
  access: {
    create: editorsAndAdmins,
    read: publicRead,
    update: editorsAndAdmins,
    delete: editorsAndAdmins,
  },
  // Soft delete, and here it protects more than the record. Deleting an upload
  // removes the file every post referencing it renders, so the blast radius of
  // a mistaken delete is every article that used the image — and unlike a post,
  // nothing about the admin list makes that visible before the click.
  trash: true,
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
    // Where the subject of the picture is, so a crop keeps it.
    //
    // The `og` derivative below is the only size with both a width and a
    // height, which makes it the only one Payload crops — and without this it
    // crops from the centre, blind. For a publication that writes about
    // specific works, a centre crop is close to the worst available default:
    // the share card for an essay about a figure at the edge of a canvas cuts
    // the figure out, and nothing about the admin says it happened.
    //
    // `crop` turns on the editor's own cropping handles beside it. Neither
    // changes an existing file: derivatives are generated at upload, so media
    // stored before this has the crop it already had, and `pnpm backfill:media`
    // is what regenerates them once somebody sets a point worth regenerating
    // for.
    focalPoint: true,
    crop: true,
    imageSizes: [
      // Listing thumbnails. `lib/content/media.ts` hands this to `next/image`
      // as the source for cards, so the optimiser resizes from 768px instead of
      // from a multi-megabyte original on every cold cache entry.
      { name: 'card', width: 768, withoutEnlargement: true },
      // Share cards. 1.91:1 is what Open Graph consumers crop to anyway, so
      // producing it here is the difference between a scraper downloading a
      // 3000px original and downloading the thing it was going to make.
      //
      // `withoutEnlargement` is left unset, which is not the same as leaving
      // enlargement on: Payload's default is to omit a size entirely when the
      // source is smaller than the target in both dimensions. So an image under
      // 1200x630 gets no `og` derivative at all and the metadata helpers fall
      // back to the original — which is the right answer for a small source.
      // Upscaling it would hand a crawler the same picture, blurrier and four
      // times the bytes, and cropped to a ratio the original never had.
      //
      // Derivatives are generated at upload, so media stored before this size
      // existed has none. `pnpm backfill:media` regenerates them; the fallback
      // means nothing is broken until it runs.
      { name: 'og', width: 1200, height: 630 },
    ],
  },
  fields: [
    {
      // What breaks if this goes. The comment on `trash` above says nothing in
      // the admin makes a delete's blast radius visible before the click; this
      // is what makes it visible.
      name: 'usage',
      type: 'ui',
      admin: {
        components: { Field: '/components/admin/MediaUsage#MediaUsage' },
      },
    },
    { name: 'alt', type: 'text', required: true },
    { name: 'caption', type: 'textarea' },
    { name: 'credit', type: 'text' },
    {
      name: 'creditURL',
      label: 'Credit URL',
      type: 'text',
      admin: {
        description:
          'Where the credit points — the photographer’s profile, or the ' +
          'page the image came from. The credit line renders as a link when ' +
          'this is set and as plain text when it is not. Store the address ' +
          'itself: referral parameters are added when the link is built, so ' +
          'they do not have to be right in every row.',
      },
      // Checked here and again in `lib/content/attribution.ts`, which is what
      // the page actually renders through. This stops a bad value being
      // stored; that stops one already stored from reaching an `href`.
      validate: (value: string | null | undefined) => {
        const raw = (value ?? '').trim()
        if (!raw) return true
        if (toCreditURL(raw)) return true
        return 'Credit links must be a full https:// address.'
      },
    },
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
    ghostUrlField({ unique: true }),
    migrationStatusField(['pending', 'migrated', 'failed']),
  ],
}
