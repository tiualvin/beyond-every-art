// Migration bookkeeping, shared by every collection that carries it.
//
// Two problems, one file.
//
// **It was public.** `posts`, `tags`, `authors` and `media` are all readable by
// anyone, so `GET /api/posts` handed an anonymous caller the publication's
// Ghost ObjectIDs and the per-document state of its migration. None of it is
// rendered — `RawPost` in `lib/content/queries.ts` does not even name these
// fields — so the exposure bought nothing. Field-level `read` closes it. This
// is the opposite call from the one `legacyHTML` makes, and for the opposite
// reason: that field *is* the published body, so gating its read would blank
// real pages while protecting markup that is public the moment it renders.
//
// **`ghostID` was `required`.** It is the import's idempotency key, so it has
// to stay unique — but requiring it meant an editor creating a page in the
// admin panel had to invent a Ghost ID for a document Ghost had never seen.
// `lib/mcp/tools.ts` had already worked around that for articles it drafted;
// nothing could work around it for pages. Autofilling a `native:` value keeps
// every document identified, keeps uniqueness intact, and leaves an explicitly
// supplied ID — the importer's — untouched.

import type { SelectField, TextField } from 'payload'

import { editorsAndAdminsField } from '../access/roles'
import { nativeGhostID } from '../lib/migration/native-id'

/** Read gate shared by every field in this file. */
const internalOnly = { read: editorsAndAdminsField } as const

type GhostIdOptions = {
  /**
   * Mint a `native:` identifier when one is not supplied on create.
   *
   * For the collections an editor authors into directly — Posts and Pages.
   * Elsewhere (`tags`, `authors`, `users`) the field is genuinely optional and
   * an empty one is the honest answer: those records are not addressable
   * content and nothing keys a rerun on them.
   */
  autofill?: boolean
}

export function ghostIdField({
  autofill = false,
}: GhostIdOptions = {}): TextField {
  return {
    name: 'ghostID',
    label: 'Ghost ID',
    type: 'text',
    unique: true,
    index: true,
    access: internalOnly,
    ...(autofill
      ? {
          hooks: {
            beforeValidate: [
              ({ operation, value }) =>
                operation === 'create' && !value ? nativeGhostID() : value,
            ],
          },
        }
      : {}),
    admin: {
      readOnly: true,
      description: autofill
        ? 'Set by the Ghost import, or minted as “native:…” for content written here. Never edit it: a rerun of the import matches on this value.'
        : 'Set by the Ghost import. Never edit it: a rerun of the import matches on this value.',
    },
  }
}

type GhostUrlOptions = {
  /**
   * Enforce one document per source URL.
   *
   * True for `media`, where the URL is what the importer de-duplicates on —
   * the same image referenced by twenty posts must resolve to one upload. False
   * for `posts`, where it is a record of where the article used to live and two
   * documents legitimately never share one.
   */
  unique?: boolean
}

export function ghostUrlField({
  unique = false,
}: GhostUrlOptions = {}): TextField {
  return {
    name: 'ghostURL',
    label: 'Ghost URL',
    type: 'text',
    ...(unique ? { unique: true, index: true } : {}),
    access: internalOnly,
    admin: {
      readOnly: true,
      description: 'Where this lived on the Ghost site.',
    },
  }
}

/**
 * How a document fared during the import.
 *
 * The options differ by collection and stay arguments: an article can end up
 * in `conflict` because two Ghost posts wanted one slug, which is not a state
 * an image can reach.
 */
export function migrationStatusField(options: string[]): SelectField {
  return {
    name: 'migrationStatus',
    type: 'select',
    options,
    access: internalOnly,
    admin: {
      readOnly: true,
      description: 'Written by the Ghost import. Filter on it to find gaps.',
    },
  }
}
