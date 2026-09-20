import type { CollectionConfig } from 'payload'

import { editorsAndAdmins, publishedOrEditors } from '../access/roles'
import { ghostIdField } from '../fields/ghost'
import { noindexField, seoFields } from '../fields/seo'
import { slugField } from '../fields/slug'
import { CONTENT_TAGS } from '../lib/cache/content'
import { contentEditor } from '../lib/content/editor'
import { stampPublishedAt } from '../lib/content/publish-date'
import { purgeOnChange, purgeOnDelete } from '../lib/cache/purge'
import { recordMcpWrite } from '../lib/mcp/audit'
import { refuseMcpPublish } from '../lib/mcp/publish-guard'
import { buildPreviewUrl } from '../lib/preview/live-preview'

export const Pages: CollectionConfig = {
  slug: 'pages',
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'publishedAt', '_status'],
    preview: (doc) => buildPreviewUrl({ collection: 'pages', slug: doc?.slug }),
  },
  access: {
    create: editorsAndAdmins,
    read: publishedOrEditors,
    update: editorsAndAdmins,
    delete: editorsAndAdmins,
  },
  // See the note in Posts.ts: a deleted page was recoverable only by restoring
  // the whole database, and a page is a URL somebody else may already be
  // linking to.
  trash: true,
  hooks: {
    beforeChange: [refuseMcpPublish, stampPublishedAt],
    afterChange: [recordMcpWrite, purgeOnChange(CONTENT_TAGS.pages)],
    afterDelete: [purgeOnDelete(CONTENT_TAGS.pages)],
  },
  // See the note in Posts.ts: autosave drives Live Preview, maxPerDoc keeps the
  // version table it fills from growing without bound.
  versions: { drafts: { autosave: { interval: 800 } }, maxPerDoc: 50 },
  // Arranged the same way as Posts, and for the same reason — see the note
  // there. Unnamed tabs, so this is presentation and not schema.
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Content',
          description: 'The page itself.',
          fields: [
            { name: 'title', type: 'text', required: true },
            {
              name: 'featuredImage',
              type: 'upload',
              relationTo: 'media',
              admin: { description: 'Opens the page, where one is set.' },
            },
            { name: 'content', type: 'richText', editor: contentEditor },
            {
              name: 'legacyHTML',
              label: 'Legacy HTML',
              type: 'code',
              admin: {
                language: 'html',
                description:
                  'The body every migrated page renders from. The rich-text editor above wins whenever it has anything in it, so writing there replaces this — it is not merged with it.',
              },
            },
          ],
        },
        {
          label: 'Search & sharing',
          description:
            'How this looks in a search result and when somebody posts the link. Every field here is optional; each falls back to the page itself.',
          fields: [
            {
              name: 'searchPreview',
              type: 'ui',
              admin: {
                components: {
                  Field: '/components/admin/SearchPreview#SearchPreview',
                },
              },
            },
            ...seoFields({ canonical: true }),
          ],
        },
        {
          label: 'Migration',
          description:
            'Written by the Ghost import. Read-only, and staff-only: none of it reaches a reader.',
          fields: [ghostIdField({ autofill: true })],
        },
      ],
    },

    // --- Sidebar: the decisions about the page, beside the publish button.

    slugField({ reserved: true, sidebar: true }),
    {
      name: 'publishedAt',
      label: 'Publish date',
      type: 'date',
      admin: {
        position: 'sidebar',
        description:
          'Set this ahead and the page stays off the site until then. Left empty, it is filled in when the page is published.',
      },
    },
    noindexField(),
  ],
}
