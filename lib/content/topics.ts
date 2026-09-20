// Which tags are subjects, and which are only workflow.
//
// "What we cover" presents each tag as something the publication writes about,
// with a fill height standing for how much of the archive it covers. That claim
// is only true of tags that name a subject. Ghost's tag list also carries
// workflow markers — `featured` is a placement, not a topic, and two posts
// carry it — and rendering one as a pigment swatch beside Palette and
// Exhibitions states something about the publication that is not so.
//
// A denylist rather than a field on `Tags`: the distinction is about three tags
// imported from Ghost, an editor gains nothing by maintaining a boolean on
// every tag they create, and a schema change needs a migration. The tag archive
// itself is untouched — `/tag/featured/` is a URL Ghost served, it stays in the
// sitemap (`app/sitemap.ts` counts independently), and it remains reachable
// from the posts that carry it. This governs the homepage chart only.

/** Tag slugs that name a placement or a state rather than a subject. */
export const WORKFLOW_TAG_SLUGS: readonly string[] = ['featured']

/** Whether a tag names something the publication covers. */
export function isSubjectTag(slug: string): boolean {
  return !WORKFLOW_TAG_SLUGS.includes(slug.trim().toLowerCase())
}
