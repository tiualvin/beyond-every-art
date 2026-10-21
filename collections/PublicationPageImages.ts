import type { CollectionConfig } from 'payload'

import { publicationPageImagesRead } from '../access/publications'
import { adminOnly, isAdmin } from '../access/roles'
import { PUBLICATIONS_LAUNCHED } from '../lib/publications/launch'
import { RENDITION } from '../lib/publications/processing/plan'

export const PUBLICATION_PAGE_IMAGES = 'publication-page-images'

/**
 * Where page images live in the media bucket. Without a prefix they would sit
 * at the bucket root beside media's objects, and Payload checks file names for
 * collisions only within one collection: a page image named like a media file
 * would overwrite it in R2, and deleting the page would delete the picture.
 */
export const PAGE_IMAGE_PREFIX = 'publication-pages'

/**
 * What a page image tells caches, by launch state.
 *
 * Before launch only an editor can fetch one, and Cloudflare must not keep a
 * copy to hand anyone else; the CMS hostname is proxied too. After it, a
 * page image's name is a hash of its bytes (`pageImageFilename`), so a URL
 * never changes what it shows and can be cached for a year without a purge.
 * Payload calls this only for a file it is about to serve, so a refusal or a
 * missing file never carries it.
 */
export function pageImageCacheControl(launched: boolean): string {
  return launched ? 'public, max-age=31536000, immutable' : 'private, no-store'
}

/**
 * Pages of a publication, drawn by the processing command
 * (`scripts/process-publication.ts`) — one upload per page, with the smaller
 * sizes Payload derives from it.
 *
 * Decision 3 in `docs/PUBLICATION_SYSTEM.md` serves page images through Payload
 * like other media, which is what makes this an upload collection rather than
 * keys in a bucket. It is not `media`: hundreds of pages would bury the
 * library editors pick covers from, and media is readable by anyone.
 *
 * Only the processing command writes here, through the Local API with
 * `overrideAccess`, and a page image is never edited — a redrawn page is a new
 * file under a new name. Administrators can see the collection, to check what
 * a run wrote; it is hidden from everyone else.
 *
 * The public hostname does not serve these yet. Its Caddy exception, the
 * `robots.txt` line and the reader that uses them arrive together with the
 * reader, where they can be tested end to end; until then an editor sees page
 * images in the admin on the CMS hostname.
 */
export const PublicationPageImages: CollectionConfig = {
  slug: PUBLICATION_PAGE_IMAGES,
  admin: {
    group: 'Publications',
    hidden: ({ user }) => !isAdmin(user),
    useAsTitle: 'filename',
    defaultColumns: ['filename', 'publication', 'width', 'height', 'createdAt'],
    description:
      'Rendered pages, written by the processing command. Nothing here is edited by hand.',
  },
  access: {
    create: () => false,
    read: publicationPageImagesRead,
    update: () => false,
    delete: adminOnly,
  },
  upload: {
    // Where the processing command writes when R2 is not configured — in
    // development and CI; the `publications` service refuses to run without
    // R2. Not under `media/`: that is media's own directory, and media's file
    // route, which anyone may read, served a page image from inside it to a
    // request for `publication-pages%2F<name>`, before launch and uncached.
    staticDir: 'publication-pages',
    // WebP only: the processing command writes nothing else, and files served
    // from `/api/<collection>/file/` come from the site's own origin (see the
    // note on SVG in collections/Media.ts).
    mimeTypes: ['image/webp'],
    focalPoint: false,
    crop: false,
    adminThumbnail: 'thumbnail',
    imageSizes: RENDITION.sizes.map((size) => ({
      name: size.name,
      width: size.width,
      withoutEnlargement: true,
      formatOptions: {
        format: 'webp',
        options: { quality: RENDITION.quality },
      },
    })),
    modifyResponseHeaders: ({ headers }) => {
      headers.set('Cache-Control', pageImageCacheControl(PUBLICATIONS_LAUNCHED))
      return headers
    },
  },
  fields: [
    {
      name: 'publication',
      type: 'relationship',
      relationTo: 'publications',
      required: true,
      index: true,
      admin: { readOnly: true },
    },
    {
      // The storage plugin's fields, declared so the columns exist whether or
      // not R2 is configured; enabled, the plugin replaces each with its own
      // definition. See `_objectKey` in collections/Media.ts, and
      // tests/collections/storage-shape.test.ts, which fails if the two
      // configurations disagree about a column.
      name: 'prefix',
      type: 'text',
      // The plugin's own default, given here too: enabled, the plugin keeps a
      // declared default and otherwise supplies this one, and Postgres makes a
      // default part of the column — so without it a migration generated
      // with R2 configured set a default the committed schema lacked, and CI's
      // drift check, which runs without R2, would fail on the next one.
      defaultValue: PAGE_IMAGE_PREFIX,
      admin: { hidden: true, readOnly: true },
    },
    {
      name: '_objectKey',
      type: 'text',
      admin: { hidden: true, readOnly: true },
    },
  ],
}
