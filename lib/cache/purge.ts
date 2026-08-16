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
/**
 * The tags a purge hook drops, readable from the hook itself.
 *
 * Each of these functions returns a closure, so from the outside one purge hook
 * is indistinguishable from another and a collection that quietly lost its
 * wiring looks exactly like one that still has it. The failure that matters —
 * a collection whose writes stop purging — is invisible in code review and
 * shows up as stale pages days later, so the tags are carried on the function
 * where `tests/cache/purge.test.ts` can check every collection at once.
 */
export type PurgeHook<H> = H & { purgeTags: readonly ContentTag[] }

function purging<H extends object>(hook: H, tags: ContentTag[]): PurgeHook<H> {
  return Object.assign(hook, { purgeTags: Object.freeze([...tags]) })
}

export function purgeOnChange(
  ...tags: ContentTag[]
): PurgeHook<CollectionAfterChangeHook> {
  return purging<CollectionAfterChangeHook>(({ doc }) => {
    revalidateContent(tags)
    return doc
  }, tags)
}

export function purgeOnDelete(
  ...tags: ContentTag[]
): PurgeHook<CollectionAfterDeleteHook> {
  return purging<CollectionAfterDeleteHook>(({ doc }) => {
    revalidateContent(tags)
    return doc
  }, tags)
}

export function purgeGlobalOnChange(
  ...tags: ContentTag[]
): PurgeHook<GlobalAfterChangeHook> {
  return purging<GlobalAfterChangeHook>(({ doc }) => {
    revalidateContent(tags)
    return doc
  }, tags)
}
