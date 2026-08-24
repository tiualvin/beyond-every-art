import type { CollectionConfig } from 'payload'

import { editorsAndAdmins, publishedOrEditors } from '../access/roles'
import { ghostIdField } from '../fields/ghost'
import { seoFields } from '../fields/seo'
import { slugField } from '../fields/slug'
import { CONTENT_TAGS } from '../lib/cache/content'
import { contentEditor } from '../lib/content/editor'
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
    beforeChange: [refuseMcpPublish],
    afterChange: [recordMcpWrite, purgeOnChange(CONTENT_TAGS.pages)],
    afterDelete: [purgeOnDelete(CONTENT_TAGS.pages)],
  },
  // See the note in Posts.ts: autosave drives Live Preview, maxPerDoc keeps the
  // version table it fills from growing without bound.
  versions: { drafts: { autosave: { interval: 800 } }, maxPerDoc: 50 },
  fields: [
    { name: 'title', type: 'text', required: true },
    slugField({ reserved: true }),
    { name: 'publishedAt', type: 'date' },
    { name: 'content', type: 'richText', editor: contentEditor },
    {
      name: 'legacyHTML',
      label: 'Legacy HTML',
      type: 'code',
      admin: { language: 'html' },
    },
    { name: 'featuredImage', type: 'upload', relationTo: 'media' },
    ...seoFields({ canonical: true, noindex: true }),
    ghostIdField({ autofill: true }),
  ],
}
