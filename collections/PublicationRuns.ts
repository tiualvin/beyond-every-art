import type { CollectionConfig } from 'payload'

import { adminOnly, editorsAndAdmins, isAdmin } from '../access/roles'

export const PUBLICATION_RUNS = 'publication-runs'

/**
 * One row per processing run: what was processed, how far it got, and how it
 * ended. The Publication edit view shows the newest
 * (`components/admin/ProcessingStatus.tsx`).
 *
 * Processing state lives here rather than on the publication because that
 * document has drafts and autosave: Payload bases every update on the newest
 * version, which may be an editor's unsaved draft, so a run writing progress
 * there could publish a half-finished edit, and a hundred progress ticks would
 * push the issue's history out of its 50-version window
 * (`docs/PUBLICATION_SYSTEM.md`, "Processing state"). No versions here, for the
 * same reason.
 *
 * Only `scripts/process-publication.ts` writes, through the Local API with
 * `overrideAccess`. Editors can read, because the status panel runs with the
 * signed-in user's access; nobody edits a run, and only an administrator can
 * delete one.
 */
export const PublicationRuns: CollectionConfig = {
  slug: PUBLICATION_RUNS,
  admin: {
    group: 'Publications',
    hidden: ({ user }) => !isAdmin(user),
    defaultColumns: [
      'publication',
      'status',
      'progress',
      'pageCount',
      'createdAt',
    ],
    description:
      'Processing runs, newest first. Written by the processing command.',
  },
  defaultSort: '-createdAt',
  access: {
    create: () => false,
    read: editorsAndAdmins,
    update: () => false,
    delete: adminOnly,
  },
  fields: [
    {
      name: 'publication',
      type: 'relationship',
      relationTo: 'publications',
      required: true,
      index: true,
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      index: true,
      // `lib/publications/processing/plan.ts` names these and says which can
      // still be writing.
      options: [
        { label: 'Downloading', value: 'downloading' },
        { label: 'Validating', value: 'validating' },
        { label: 'Extracting links', value: 'extracting-links' },
        { label: 'Processing pages', value: 'processing-pages' },
        { label: 'Cleaning up', value: 'cleaning-up' },
        { label: 'Ready', value: 'ready' },
        { label: 'Failed', value: 'failed' },
      ],
    },
    {
      name: 'source',
      type: 'group',
      fields: [
        {
          name: 'kind',
          type: 'select',
          options: [
            // A key under `publication-sources/` in the media bucket.
            { label: 'R2', value: 'r2' },
            { label: 'File', value: 'file' },
            { label: 'Generated sample', value: 'sample' },
          ],
        },
        {
          name: 'name',
          type: 'text',
          admin: { description: 'The R2 key, or the file name.' },
        },
        { name: 'bytes', type: 'number' },
        { name: 'sha256', label: 'SHA-256', type: 'text' },
      ],
    },
    { name: 'pageCount', type: 'number' },
    { name: 'pagesDone', type: 'number' },
    { name: 'currentPage', type: 'number' },
    { name: 'progress', type: 'number', min: 0, max: 100 },
    {
      name: 'rendition',
      type: 'number',
      admin: { description: 'RENDITION.version when the run started.' },
    },
    {
      name: 'startedAt',
      type: 'date',
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'finishedAt',
      type: 'date',
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'rejection',
      type: 'select',
      admin: { description: 'Set when the file itself cannot be processed.' },
      options: [
        { label: 'Needs a password', value: 'password' },
        { label: 'Unreadable', value: 'unreadable' },
        { label: 'Too many pages', value: 'too-many-pages' },
        { label: 'Too large', value: 'too-large' },
      ],
    },
    { name: 'error', type: 'textarea' },
    {
      name: 'summary',
      type: 'json',
      admin: {
        description:
          'Counts from the finished run: pages skipped, links found and refused, words.',
      },
    },
  ],
}
