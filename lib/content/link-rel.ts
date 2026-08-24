// What goes in a link's `rel`, decided in one place.
//
// Google asks that a link paid for, or placed as part of a commercial
// arrangement, says so — `rel="sponsored"` — and that links the publication
// does not vouch for say that too. This is not decoration: an affiliate or
// advertising link that passes ranking signal like an editorial one is the
// thing manual actions are issued for, and a publication that starts running
// campaign pages acquires exactly those links.
//
// The block schemas therefore offer the choice, and this turns the choice into
// an attribute. It is here rather than in either renderer because the button
// and the bookmark must not drift: two components deciding separately what
// "sponsored" means is how one of them ends up not meaning it.

export const LINK_RELATIONSHIPS = [
  'normal',
  'sponsored',
  'nofollow',
  'ugc',
] as const

export type LinkRelationship = (typeof LINK_RELATIONSHIPS)[number]

/** The stored value, or the default when it is missing or unrecognised. */
export function toLinkRelationship(
  value: string | null | undefined,
): LinkRelationship {
  return LINK_RELATIONSHIPS.includes(value as LinkRelationship)
    ? (value as LinkRelationship)
    : 'normal'
}

/**
 * The `rel` for a link, or undefined when it needs none.
 *
 * `noopener noreferrer` is added for every external link regardless of the
 * relationship, because that pair is about the window this page hands the
 * destination, not about ranking. It is omitted for an internal path, where
 * there is nothing to protect against and where `nofollow` on your own site
 * only wastes the link.
 *
 * `normal` on an internal link therefore yields nothing at all, which is what
 * lets `rel` be dropped from the markup entirely rather than emitted empty.
 */
export function linkRel(
  relationship: string | null | undefined,
  { external }: { external: boolean },
): string | undefined {
  const tokens: string[] = []

  const value = toLinkRelationship(relationship)
  if (value !== 'normal') tokens.push(value)

  if (external) tokens.push('noopener', 'noreferrer')

  return tokens.length > 0 ? tokens.join(' ') : undefined
}
