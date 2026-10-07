// Whether the publication's pages are shown to readers.
//
// The owner signs off the launch of `/publication/` separately from the work
// that builds it (`docs/PUBLICATION_SYSTEM.md`, open decision 8): it is a new
// public URL, a sitemap entry and a menu item, which are things a crawler
// caches. Until then every publication route answers 404 to readers and renders
// for an editor previewing, so the pages can be built, merged and checked on
// the live site without being published.
//
// A constant, not an environment variable or a switch in the admin. Flipping
// it is a reviewed commit that records who signed off; it is the same in every
// environment; and nothing at runtime can turn it on by accident. The sitemap
// entries, structured data and menu item belong in the same change.

export const PUBLICATIONS_LAUNCHED = false

/**
 * Whether a publication route may render for this request.
 *
 * `draft` is `getPreviewMode().draft`, which is true only for a request that
 * still carries an editorial Payload session — a stale or copied preview
 * cookie reads as a reader (`lib/preview/mode.ts`) and gets the 404.
 */
export function publicationRoutesOpen(
  preview: { draft: boolean },
  launched: boolean = PUBLICATIONS_LAUNCHED,
): boolean {
  return launched || preview.draft
}
