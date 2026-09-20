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
  ghostUpdatedAtField,
  ghostUrlField,
  migrationStatusField,
} from '../fields/ghost'
import { noindexField, seoFields } from '../fields/seo'
import { slugField } from '../fields/slug'
import { CONTENT_TAGS } from '../lib/cache/content'
import { contentEditor } from '../lib/content/editor'
import { stampPublishedAt } from '../lib/content/publish-date'
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
      // Last, so it sees the status this write actually lands on.
      stampPublishedAt,
    ],
    afterChange: [recordMcpWrite, purgeOnChange(CONTENT_TAGS.posts)],
    afterDelete: [purgeOnDelete(CONTENT_TAGS.posts)],
  },
  // Autosave is what makes Live Preview live: the iframe re-renders on save,
  // so without it the preview only moves when an editor remembers to press a
  // button. `maxPerDoc` is the counterweight — autosave writes a version per
  // typing pause, and untrimmed version tables land in every database backup.
  versions: { drafts: { autosave: { interval: 800 } }, maxPerDoc: 50 },
  // Arranged, rather than listed in the order the fields were invented.
  //
  // Twenty fields stood in one flat column. The thing an editor opened the
  // screen to do — write — was tenth, below a date nobody had explained, an
  // ownership picker, and three relationship rows; and the two fields that
  // decide where an article *appears* on the site sat below the search metadata,
  // nowhere near the publish button they belong to.
  //
  // The tabs are unnamed, which is load-bearing: a named tab is a group and
  // would move every field inside it into its own column. Unnamed tabs are
  // presentation only, so this rearranges the screen and changes no schema —
  // `pnpm migrate:db:create` generates nothing against it.
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Content',
          description: 'The article itself.',
          fields: [
            { name: 'title', type: 'text', required: true },
            {
              name: 'excerpt',
              type: 'textarea',
              admin: {
                description:
                  'The standfirst under the headline, and the line every card, feed item and share preview uses. A post without one shows a blank card in the archive.',
              },
            },
            {
              name: 'featuredImage',
              type: 'upload',
              relationTo: 'media',
              admin: {
                description:
                  'Opens the article and fills its card in every listing.',
              },
            },
            { name: 'content', type: 'richText', editor: contentEditor },
            {
              name: 'legacyHTML',
              label: 'Legacy HTML',
              type: 'code',
              admin: {
                language: 'html',
                // Kept in this tab, beside the editor, rather than filed under
                // Migration where the rest of the import bookkeeping lives.
                // For a migrated article the rich-text editor above is empty
                // and *this* is the body the site renders, so a tab away is a
                // trap: the article looks blank in the place an editor is
                // meant to read it.
                description:
                  'The body every migrated article renders from. The rich-text editor above wins whenever it has anything in it, so writing there replaces this — it is not merged with it.',
              },
              // `toBodyHtml` hands this straight to `dangerouslySetInnerHTML`,
              // so whoever can write it can execute script on the public site.
              // Post `create` is open to any authenticated user and `update` to
              // the post's owner, which would put stored XSS within reach of
              // the `author` role. Writing raw HTML is an editorial trust
              // decision, so it takes editor rights. `read` stays open on
              // purpose: the field holds the body every migrated document
              // renders from, so a read rule here would blank those bodies on
              // any path that respects field access while protecting nothing —
              // the markup is public the moment the page is published.
              access: {
                create: editorsAndAdminsField,
                update: editorsAndAdminsField,
              },
            },
          ],
        },
        {
          label: 'Search & sharing',
          description:
            'How this looks in a search result and when somebody posts the link. Every field here is optional; each falls back to the article itself.',
          fields: seoFields({ canonical: true }),
        },
        {
          label: 'Migration',
          description:
            'Written by the Ghost import. Read-only, and staff-only: none of it reaches a reader.',
          fields: [
            ghostIdField({ autofill: true }),
            ghostUpdatedAtField(),
            ghostUrlField(),
            migrationStatusField(['pending', 'migrated', 'conflict', 'failed']),
          ],
        },
      ],
    },

    // --- Sidebar: the decisions about the article, beside the publish button.

    slugField({ reserved: true, sidebar: true }),
    {
      name: 'publishedAt',
      label: 'Publish date',
      type: 'date',
      index: true,
      admin: {
        position: 'sidebar',
        description:
          'Set this ahead and the article stays off the site until then — it is how a piece is scheduled. Left empty, it is filled in when the article is published.',
      },
    },
    {
      name: 'visibility',
      type: 'select',
      // Labelled, because the stored values are the ones Ghost used and they
      // are not self-explanatory: "paid" does not mean an article costs money,
      // and the difference between the two gated levels is a promise to a
      // reader rather than a mechanism. Both gate identically today — there is
      // no account system behind either — and the labels say what a reader is
      // actually told, which is what an editor is choosing between.
      options: [
        { label: 'Public — anyone can read it', value: 'public' },
        { label: 'Members — teaser, marked “Members”', value: 'members' },
        { label: 'Subscribers — teaser, marked “Subscribers”', value: 'paid' },
      ],
      defaultValue: 'public',
      admin: {
        position: 'sidebar',
        description:
          'A gated article is still listed, searched and syndicated; what changes is how much of the body a reader is given.',
      },
    },
    {
      name: 'featured',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        position: 'sidebar',
        description: 'Eligible for the lead tier on the homepage.',
      },
    },
    {
      name: 'authors',
      type: 'relationship',
      relationTo: 'authors',
      hasMany: true,
      admin: {
        position: 'sidebar',
        description: 'The public byline. Order is the order they appear in.',
      },
    },
    {
      name: 'tags',
      type: 'relationship',
      relationTo: 'tags',
      hasMany: true,
      admin: {
        position: 'sidebar',
        description:
          'The first one labels the card; all of them file the article under a tag archive.',
      },
    },
    noindexField(),
    {
      name: 'owners',
      type: 'relationship',
      relationTo: 'users',
      hasMany: true,
      admin: {
        position: 'sidebar',
        description: 'Private CMS editing ownership; not a public byline.',
      },
      access: {
        read: editorsAndAdminsField,
        create: editorsAndAdminsField,
        update: editorsAndAdminsField,
      },
    },
  ],
}
