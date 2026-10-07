import type { CollectionConfig } from 'payload'

import { publicationsRead } from '../access/publications'
import { editorsAndAdmins } from '../access/roles'
import { seoFields } from '../fields/seo'
import { slugField } from '../fields/slug'
import { CONTENT_TAGS } from '../lib/cache/content'
import { purgeOnChange, purgeOnDelete } from '../lib/cache/purge'
import { stampPublishedAt } from '../lib/content/publish-date'
import { buildPreviewUrl } from '../lib/preview/live-preview'

/**
 * Issues of the publication — the magazine, journal issues and exhibition
 * guides — presented at `/publication/`. See `docs/PUBLICATION_SYSTEM.md`.
 *
 * This is the editorial document only. Everything a processing run produces
 * (page count, page images, extracted text, status) belongs to collections
 * without versions, added with the processing work: this one has drafts and
 * autosave, and Payload bases every update on the latest version — which may be
 * an editor's unsaved draft — so a worker writing here could publish a
 * half-finished edit or unpublish a live issue.
 *
 * `slug` skips the reserved-route check for the same reason Apps does: issues
 * live under `/publication/<slug>/`, not at the root.
 *
 * Nothing here reaches readers until the owner signs off the launch;
 * `lib/publications/launch.ts` holds the switch.
 */
export const Publications: CollectionConfig = {
  slug: 'publications',
  labels: { singular: 'Publication', plural: 'Publications' },
  admin: {
    group: 'Publications',
    useAsTitle: 'title',
    defaultColumns: ['title', 'issueNumber', 'publishedAt', '_status'],
    description:
      'Issues listed at /publication/. Readers see none of this, on the site ' +
      'or through the API, until the publication system launches; until then ' +
      'an issue can be previewed like a page.',
    preview: (doc) =>
      buildPreviewUrl({ collection: 'publications', slug: doc?.slug }),
  },
  access: {
    create: editorsAndAdmins,
    // Closed before launch, and the same rules as the site after it; see
    // access/publications.ts for why the routes' own gate is not enough.
    read: publicationsRead,
    // Editors only. An issue's history is editorial working material, and
    // nobody else edits one: `versionsOf(read)` would let a signed-in author
    // read every revision that was once published, including those of an issue
    // since withdrawn, because it judges each version by its own stored status.
    readVersions: editorsAndAdmins,
    update: editorsAndAdmins,
    delete: editorsAndAdmins,
  },
  // See the note in Posts.ts. An issue's landing page is a published URL like
  // any other.
  trash: true,
  hooks: {
    // Scheduled the way posts and pages are: a future `publishedAt` keeps the
    // issue off the site until then (`live()` in lib/content/schedule.ts), and
    // publishing without one stamps today rather than leaving it undated.
    beforeChange: [stampPublishedAt],
    afterChange: [purgeOnChange(CONTENT_TAGS.publications)],
    afterDelete: [purgeOnDelete(CONTENT_TAGS.publications)],
  },
  versions: { drafts: { autosave: { interval: 800 } }, maxPerDoc: 50 },
  // Newest issue first, with drafts — which have no date yet — above them.
  defaultSort: '-publishedAt',
  fields: [
    { name: 'title', type: 'text', required: true },
    slugField({ from: 'title' }),
    {
      name: 'subtitle',
      type: 'text',
      admin: { description: 'Shown under the title on the issue’s page.' },
    },
    {
      name: 'issueNumber',
      type: 'text',
      admin: {
        description:
          'However the issue names itself — "No. 3", "Spring 2026". Free ' +
          'text, because exhibition guides and annual reports do not count.',
      },
    },
    {
      // A text field until a second series exists. With one series there is
      // nothing to relate to, and a collection built for it would be the
      // speculative build AGENTS.md rules out.
      name: 'series',
      type: 'text',
      admin: {
        description:
          'The run this issue belongs to — "Beyond Every Art Journal", ' +
          '"Exhibition Guides".',
      },
    },
    {
      name: 'description',
      type: 'textarea',
      admin: {
        description:
          'A paragraph on what is in the issue. Shown on its page and in the ' +
          'archive, and used for search results when the field below is empty.',
      },
    },
    {
      // In `media`, not a new upload collection: that one is already public,
      // served on the site's hostname, allowed through the image optimizer,
      // and carries alt text, credit and the share-card size.
      name: 'cover',
      type: 'upload',
      relationTo: 'media',
      admin: { description: 'The front cover, as a reader would see it.' },
    },
    {
      name: 'publishedAt',
      label: 'Publish date',
      type: 'date',
      index: true,
      admin: {
        position: 'sidebar',
        description:
          'Set this ahead and the issue stays off the site until then. Left ' +
          'empty, it is filled in when the issue is published.',
      },
    },
    {
      name: 'contents',
      type: 'array',
      labels: { singular: 'Entry', plural: 'Contents' },
      admin: {
        description:
          'The table of contents, in order. Entries with the same section are ' +
          'grouped under it.',
      },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'section',
              type: 'text',
              admin: {
                width: '30%',
                description: 'e.g. "Materials". Optional.',
              },
            },
            { name: 'title', type: 'text', required: true },
            {
              name: 'page',
              type: 'number',
              min: 1,
              admin: { width: '15%', description: 'Where it starts.' },
            },
          ],
        },
      ],
    },
    {
      // Read by the reader's spread pairing (`lib/publications/spreads.ts`).
      // Stored now so an issue entered before the reader exists does not need
      // revisiting when it does.
      name: 'readingDirection',
      type: 'select',
      required: true,
      defaultValue: 'ltr',
      options: [
        { label: 'Left to right', value: 'ltr' },
        { label: 'Right to left', value: 'rtl' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'firstPageIsCover',
      label: 'First page is the cover',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        position: 'sidebar',
        description:
          'Stands page 1 alone in the two-page view and pairs from 2–3. ' +
          'Untick for a PDF whose first page is the left half of a spread.',
      },
    },
    ...seoFields(),
  ],
}
