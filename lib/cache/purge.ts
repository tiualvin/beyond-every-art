import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  GlobalAfterChangeHook,
} from 'payload'

import { revalidateContent, type ContentTag } from './content'

/**
 * Payload hooks that drop the cached reads a write could have made wrong.
 *
 * They are attached to the collections and globals the public site reads from,
 * so publishing in the admin shows up on the site immediately instead of when
 * the timer runs out. Autosave writes a version per typing pause, which means
 * these run often; purging a tag is a local bookkeeping call, and the next
 * request rebuilds only what it actually needs.
 */
export function purgeOnChange(
  ...tags: ContentTag[]
): CollectionAfterChangeHook {
  return ({ doc }) => {
    revalidateContent(tags)
    return doc
  }
}

export function purgeOnDelete(
  ...tags: ContentTag[]
): CollectionAfterDeleteHook {
  return ({ doc }) => {
    revalidateContent(tags)
    return doc
  }
}

export function purgeGlobalOnChange(
  ...tags: ContentTag[]
): GlobalAfterChangeHook {
  return ({ doc }) => {
    revalidateContent(tags)
    return doc
  }
}
