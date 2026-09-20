// Giving a published document a publication date, once, at the moment it is
// published.
//
// `publishedAt` was a plain date field with nothing behind it. Every migrated
// document carried one from Ghost, so the field looked reliably populated and
// the omission stayed invisible — but an editor writing an article here and
// pressing Publish without opening the date picker published it with no date at
// all. See `schedule.ts` for what that does to ordering; the short version is
// that the article pins itself to the top of every listing on the site and
// renders undated.
//
// This is the half that stops it happening. It sets a date only when a document
// becomes published without one, which leaves three things deliberately alone:
//
//   - **A date somebody chose.** Backdating is how a migrated piece keeps its
//     real date and how an editor corrects one; forward-dating is how a piece
//     is scheduled. Neither may be overwritten.
//   - **Drafts.** A draft has no publication moment yet, and stamping one would
//     make every autosave look like a publication.
//   - **Unpublishing and re-publishing.** The date survives, because the
//     article's publication date is a fact about the article, not about the
//     last time somebody toggled its status.

import type { CollectionBeforeChangeHook } from 'payload'

type Doc = Record<string, unknown> | undefined | null

/** The value a field will hold after this write, patch or not. */
function effective(key: string, data: Doc, original: Doc): unknown {
  const incoming = data?.[key]
  if (incoming !== undefined) return incoming
  return original?.[key]
}

/**
 * Stamps `publishedAt` when a document becomes published without one.
 *
 * Reads through to `originalDoc` because Payload hands this hook a patch, not a
 * whole document: an autosave that touches only the body carries no `_status`,
 * and treating that absence as "not published" would leave the very documents
 * this exists for unstamped.
 */
export const stampPublishedAt: CollectionBeforeChangeHook = ({
  data,
  originalDoc,
}) => {
  const status = effective('_status', data, originalDoc)
  if (status !== 'published') return data

  const existing = effective('publishedAt', data, originalDoc)
  if (typeof existing === 'string' && existing.trim()) return data
  if (existing instanceof Date) return data

  return { ...data, publishedAt: new Date().toISOString() }
}
