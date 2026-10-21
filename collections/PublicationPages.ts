import type { CollectionConfig } from 'payload'

import { adminOnly, editorsAndAdmins, isAdmin } from '../access/roles'

import { PUBLICATION_PAGE_IMAGES } from './PublicationPageImages'
import { PUBLICATION_RUNS } from './PublicationRuns'

export const PUBLICATION_PAGES = 'publication-pages'

/**
 * One document per page of a publication (`docs/PUBLICATION_SYSTEM.md`,
 * "publication-pages") — never an array on the publication, which would put a
 * hundred pages of word positions into every version of it.
 *
 * Every field here belongs to the processing command, which upserts a page by
 * its issue and number. The fields an editor will own — hotspots, an
 * accessible label, approved links — arrive with the editor that sets them,
 * and must stay apart from these: the command updates only its own fields, so
 * reprocessing can never erase an editor's work.
 *
 * No versions: `words` runs to hundreds of kilobytes a page, which versioning
 * would copy fifty times. Read it with `select`, and never through
 * `cachedRead`, whose cache refuses entries over 2 MB.
 *
 * Read through the API by editors only. The reader is server-rendered and
 * reads pages itself, so nothing public ever needs this endpoint, and an
 * unpublished issue's text is exactly what it would give away.
 */
export const PublicationPages: CollectionConfig = {
  slug: PUBLICATION_PAGES,
  admin: {
    group: 'Publications',
    hidden: ({ user }) => !isAdmin(user),
    defaultColumns: ['publication', 'pageNumber', 'status', 'updatedAt'],
    description:
      'Pages of each publication, written by the processing command.',
  },
  defaultSort: 'pageNumber',
  access: {
    create: () => false,
    read: editorsAndAdmins,
    update: () => false,
    delete: adminOnly,
  },
  // One row per page of an issue. Two runs can never write two page 3s, and
  // the upsert in lib/publications/processing/store.ts relies on it.
  indexes: [{ fields: ['publication', 'pageNumber'], unique: true }],
  fields: [
    {
      name: 'publication',
      type: 'relationship',
      relationTo: 'publications',
      required: true,
      index: true,
    },
    { name: 'pageNumber', type: 'number', required: true, min: 1 },
    {
      name: 'status',
      type: 'select',
      required: true,
      options: [
        { label: 'Ready', value: 'ready' },
        { label: 'Failed', value: 'failed' },
      ],
    },
    { name: 'error', type: 'textarea' },
    {
      name: 'width',
      type: 'number',
      admin: {
        description: 'The page as displayed, in points (72 to the inch).',
      },
    },
    { name: 'height', type: 'number' },
    { name: 'image', type: 'upload', relationTo: PUBLICATION_PAGE_IMAGES },
    {
      name: 'text',
      type: 'textarea',
      admin: {
        description:
          'The page’s text in reading order, for search and the transcript.',
      },
    },
    {
      name: 'words',
      type: 'json',
      // Every word with its position, for search highlighting. Too large to
      // be worth drawing in an edit form.
      admin: { hidden: true },
    },
    {
      name: 'links',
      type: 'json',
      admin: {
        description:
          'Links found in the PDF, classified but not approved. None is shown to a reader until an editor approves it.',
      },
    },
    {
      name: 'sourceSha256',
      label: 'Source SHA-256',
      type: 'text',
      admin: { description: 'The file this page was drawn from.' },
    },
    { name: 'rendition', type: 'number' },
    { name: 'run', type: 'relationship', relationTo: PUBLICATION_RUNS },
  ],
}
