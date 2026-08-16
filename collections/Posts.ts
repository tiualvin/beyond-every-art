import type { CollectionConfig } from 'payload'

import {
  authenticated,
  deleteOwnedDrafts,
  editorsAndAdminsField,
  ownedPosts,
  postsRead,
} from '../access/roles'
import { CONTENT_TAGS } from '../lib/cache/content'
import { contentEditor } from '../lib/content/editor'
import { purgeOnChange, purgeOnDelete } from '../lib/cache/purge'
import { recordMcpWrite } from '../lib/mcp/audit'
import { refuseMcpPublish } from '../lib/mcp/publish-guard'
import { buildPreviewUrl } from '../lib/preview/live-preview'
import { validateRootContentSlug } from '../lib/seo/reserved-slugs'

export const Posts: CollectionConfig = {
  slug: 'posts',
  admin: {
    useAsTitle: 'title',
    preview: (doc) => buildPreviewUrl({ collection: 'posts', slug: doc?.slug }),
  },
  access: {
    create: authenticated,
    read: postsRead,
    update: ownedPosts,
    delete: deleteOwnedDrafts,
  },
  hooks: {
    beforeChange: [
      ({ data, operation, req }) => {
        // `req.user` is a union now that the MCP plugin adds its own auth
        // collection; only a `users` document carries a role.
        const role = (req.user as { role?: string } | null | undefined)?.role
        if (operation === 'create' && role === 'author') {
          return { ...data, owners: [req.user!.id] }
        }
        return data
      },
      refuseMcpPublish,
    ],
    afterChange: [recordMcpWrite, purgeOnChange(CONTENT_TAGS.posts)],
    afterDelete: [purgeOnDelete(CONTENT_TAGS.posts)],
  },
  // Autosave is what makes Live Preview live: the iframe re-renders on save,
  // so without it the preview only moves when an editor remembers to press a
  // button. `maxPerDoc` is the counterweight — autosave writes a version per
  // typing pause, and untrimmed version tables land in every database backup.
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
    { name: 'publishedAt', type: 'date', index: true },
    { name: 'ghostUpdatedAt', type: 'date' },
    {
      name: 'owners',
      type: 'relationship',
      relationTo: 'users',
      hasMany: true,
      admin: {
        description: 'Private CMS editing ownership; not a public byline.',
      },
      access: {
        read: editorsAndAdminsField,
        create: editorsAndAdminsField,
        update: editorsAndAdminsField,
      },
    },
    {
      name: 'authors',
      type: 'relationship',
      relationTo: 'authors',
      hasMany: true,
    },
    { name: 'tags', type: 'relationship', relationTo: 'tags', hasMany: true },
    { name: 'featuredImage', type: 'upload', relationTo: 'media' },
    { name: 'excerpt', type: 'textarea' },
    { name: 'content', type: 'richText', editor: contentEditor },
    {
      name: 'legacyHTML',
      type: 'code',
      admin: { language: 'html' },
      // `toBodyHtml` hands this straight to `dangerouslySetInnerHTML`, so
      // whoever can write it can execute script on the public site. Post
      // `create` is open to any authenticated user and `update` to the post's
      // owner, which would put stored XSS within reach of the `author` role.
      // Writing raw HTML is an editorial trust decision, so it takes editor
      // rights. `read` stays open on purpose: the field holds the body every
      // migrated document renders from, so a read rule here would blank those
      // bodies on any path that respects field access while protecting nothing
      // — the markup is public the moment the page is published.
      access: {
        create: editorsAndAdminsField,
        update: editorsAndAdminsField,
      },
    },
    { name: 'metaTitle', type: 'text' },
    { name: 'metaDescription', type: 'textarea' },
    { name: 'canonicalURL', type: 'text' },
    { name: 'featured', type: 'checkbox', defaultValue: false },
    {
      name: 'visibility',
      type: 'select',
      options: ['public', 'members', 'paid'],
      defaultValue: 'public',
    },
    {
      name: 'ghostID',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    { name: 'ghostURL', type: 'text' },
    {
      name: 'migrationStatus',
      type: 'select',
      options: ['pending', 'migrated', 'conflict', 'failed'],
    },
  ],
}
