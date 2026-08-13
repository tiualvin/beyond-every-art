import type { CollectionConfig } from 'payload'

import { editorsAndAdmins, publishedOrEditors } from '../access/roles'
import { CONTENT_TAGS } from '../lib/cache/content'
import { purgeOnChange, purgeOnDelete } from '../lib/cache/purge'
import { buildPreviewUrl } from '../lib/preview/live-preview'

/**
 * The apps the studio intends to build, presented at `/apps`.
 *
 * Editorial content, not product data: an app is a document an editor writes
 * and advances, the same way they would a page. Nothing here has shipped, so
 * the collection has to be able to describe something that does not exist yet
 * — hence `status`, and hence store URLs that stay empty until there is
 * somewhere to point them.
 *
 * `slug` deliberately skips `validateRootContentSlug`. These live under
 * `/apps/<slug>`, not at the root, so they cannot collide with a migrated
 * Ghost post or page.
 */
export const Apps: CollectionConfig = {
  slug: 'apps',
  labels: { singular: 'App', plural: 'Apps' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'stage', 'order', '_status'],
    description:
      'Apps listed on /apps. Unpublished drafts are invisible to readers, ' +
      'the nav and the sitemap, but can be previewed like a page.',
    preview: (doc) => buildPreviewUrl({ collection: 'apps', slug: doc?.slug }),
  },
  access: {
    create: editorsAndAdmins,
    read: publishedOrEditors,
    update: editorsAndAdmins,
    delete: editorsAndAdmins,
  },
  hooks: {
    afterChange: [purgeOnChange(CONTENT_TAGS.apps)],
    afterDelete: [purgeOnDelete(CONTENT_TAGS.apps)],
  },
  versions: { drafts: { autosave: { interval: 800 } }, maxPerDoc: 50 },
  defaultSort: 'order',
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    {
      name: 'tagline',
      type: 'text',
      admin: { description: 'One line, in the app’s own voice.' },
    },
    {
      name: 'summary',
      type: 'textarea',
      admin: { description: 'Shown on the /apps overview, under the name.' },
    },
    {
      name: 'detail',
      type: 'textarea',
      admin: {
        description:
          'The one concrete thing worth knowing. Opens with a short bold ' +
          'lead-in on the overview.',
      },
    },
    {
      name: 'description',
      type: 'richText',
      admin: { description: 'The full pitch, shown on the app’s own page.' },
    },
    {
      // Named `stage`, labelled "Status". A field literally called `status`
      // collides with the `_status` column Payload adds for drafts: both want
      // the enum `enum_apps_status`, and the generated migration types this
      // column as the draft enum with a default of 'concept', which will not
      // apply. The editor-facing word is the one that matters, so the label
      // keeps it and the column takes a different name.
      name: 'stage',
      label: 'Status',
      type: 'select',
      required: true,
      defaultValue: 'concept',
      options: [
        { label: 'Concept', value: 'concept' },
        { label: 'In development', value: 'in_development' },
        { label: 'Coming soon', value: 'coming_soon' },
        { label: 'Available', value: 'available' },
      ],
      admin: {
        description:
          'Anything below Available shows the waitlist form instead of ' +
          'store links.',
      },
    },
    {
      name: 'sequence',
      type: 'text',
      admin: {
        description:
          'Where this sits in the order, in plain words — "After Dapple". ' +
          'The page is a roadmap, so the order is the thing it claims.',
      },
    },
    {
      name: 'platforms',
      type: 'select',
      hasMany: true,
      defaultValue: ['ios', 'android'],
      options: [
        { label: 'iPhone', value: 'ios' },
        { label: 'Android', value: 'android' },
        { label: 'Web', value: 'web' },
      ],
    },
    {
      name: 'heroImage',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description:
          'Real artwork, once there is any. Until then the page draws the ' +
          'plate chosen below.',
      },
    },
    {
      // Not in the original spec. Every app is unbuilt, so `heroImage` is
      // empty for all of them, and four empty frames would say less than
      // nothing. The page falls back to a drawing of what the app does; this
      // is how an editor chooses which one, rather than the frontend
      // matching on slugs it should not know about.
      name: 'plate',
      type: 'select',
      defaultValue: 'reader',
      options: [
        { label: 'Reader — a page of set type', value: 'reader' },
        { label: 'Colouring — an outline being filled', value: 'colouring' },
        { label: 'Year — a grid of daily marks', value: 'year' },
        { label: 'Echo — marks sounding on night', value: 'echo' },
      ],
      admin: {
        description: 'Stand-in artwork, used only while Hero image is empty.',
      },
    },
    {
      name: 'screenshots',
      type: 'array',
      admin: { description: 'Shown on the app’s own page, once they exist.' },
      fields: [
        { name: 'image', type: 'upload', relationTo: 'media', required: true },
        { name: 'caption', type: 'text' },
      ],
    },
    {
      name: 'appStoreURL',
      type: 'text',
      admin: { condition: (data) => data?.stage === 'available' },
    },
    {
      name: 'playStoreURL',
      type: 'text',
      admin: { condition: (data) => data?.stage === 'available' },
    },
    {
      name: 'order',
      type: 'number',
      defaultValue: 0,
      index: true,
      admin: { description: 'Low to high. Ties fall back to name.' },
    },
    { name: 'metaTitle', type: 'text' },
    { name: 'metaDescription', type: 'textarea' },
  ],
}
