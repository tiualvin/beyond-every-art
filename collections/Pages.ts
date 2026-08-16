import type { CollectionConfig } from 'payload'

import { editorsAndAdmins, publishedOrEditors } from '../access/roles'
import { CONTENT_TAGS } from '../lib/cache/content'
import { contentEditor } from '../lib/content/editor'
import { purgeOnChange, purgeOnDelete } from '../lib/cache/purge'
import { recordMcpWrite } from '../lib/mcp/audit'
import { refuseMcpPublish } from '../lib/mcp/publish-guard'
import { buildPreviewUrl } from '../lib/preview/live-preview'
import { validateRootContentSlug } from '../lib/seo/reserved-slugs'

export const Pages: CollectionConfig = {
  slug: 'pages',
  admin: {
    useAsTitle: 'title',
    preview: (doc) => buildPreviewUrl({ collection: 'pages', slug: doc?.slug }),
  },
  access: {
    create: editorsAndAdmins,
    read: publishedOrEditors,
    update: editorsAndAdmins,
    delete: editorsAndAdmins,
  },
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
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      validate: validateRootContentSlug,
    },
    { name: 'publishedAt', type: 'date' },
    { name: 'content', type: 'richText', editor: contentEditor },
    { name: 'legacyHTML', type: 'code', admin: { language: 'html' } },
    { name: 'featuredImage', type: 'upload', relationTo: 'media' },
    { name: 'metaTitle', type: 'text' },
    { name: 'metaDescription', type: 'textarea' },
    { name: 'canonicalURL', type: 'text' },
    {
      name: 'ghostID',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
  ],
}
