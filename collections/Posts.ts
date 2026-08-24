import type { CollectionConfig } from 'payload'

import {
  authenticated,
  deleteOwnedDrafts,
  editorsAndAdminsField,
  ownedPosts,
  postsRead,
} from '../access/roles'
import {
  ghostIdField,
  ghostUrlField,
  migrationStatusField,
} from '../fields/ghost'
import { seoFields } from '../fields/seo'
import { slugField } from '../fields/slug'
import { CONTENT_TAGS } from '../lib/cache/content'
import { contentEditor } from '../lib/content/editor'
import { purgeOnChange, purgeOnDelete } from '../lib/cache/purge'
import { recordMcpWrite } from '../lib/mcp/audit'
import { refuseMcpPublish } from '../lib/mcp/publish-guard'
import { buildPreviewUrl } from '../lib/preview/live-preview'

export const Posts: CollectionConfig = {
  slug: 'posts',
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'publishedAt', 'visibility', '_status'],
    preview: (doc) => buildPreviewUrl({ collection: 'posts', slug: doc?.slug }),
  },
  // The date an editor thinks in. Postgres orders nulls first on a descending
  // sort, so drafts — which have no `publishedAt` yet — collect at the top of
  // the list, which is where the work in progress belongs.
  defaultSort: '-publishedAt',
  access: {
    create: authenticated,
    read: postsRead,
    update: ownedPosts,
    delete: deleteOwnedDrafts,
  },
  // Soft delete. `deleteOwnedDrafts` lets an author destroy their own draft and
  // an editor destroy anything, and until now the only way back from a mistake
  // was last night's backup — which restores the whole database, so recovering
  // one article means losing every change made since. Trashed documents leave
  // the site and every listing exactly as a deleted one did; they are simply
  // still there to restore.
  trash: true,
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
    slugField({ reserved: true }),
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
      label: 'Legacy HTML',
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
    ...seoFields({ canonical: true, noindex: true }),
    { name: 'featured', type: 'checkbox', defaultValue: false },
    {
      name: 'visibility',
      type: 'select',
      options: ['public', 'members', 'paid'],
      defaultValue: 'public',
    },
    ghostIdField({ autofill: true }),
    ghostUrlField(),
    migrationStatusField(['pending', 'migrated', 'conflict', 'failed']),
  ],
}
