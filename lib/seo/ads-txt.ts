// The `ads.txt` authorized-sellers record, and the rendering of it.
//
// `ads.txt` is how a site tells ad buyers which sellers may sell its inventory:
// a buyer's crawler fetches `https://<domain>/ads.txt`, and a bid claiming to
// sell this site through an account not listed here is discarded as
// unauthorized. AdSense will not serve ads on a domain whose file it cannot
// fetch, so "not found" is not a warning — it is the whole of the file's job
// failing. The IAB spec is at https://iabtechlab.com/ads-txt/.
//
// Pure and framework-free, in the same shape as the rest of `lib/seo/`, so the
// exact bytes served can be asserted in a unit test rather than checked by eye
// on a deployed domain.

/**
 * Google's certification authority ID in the TAG registry.
 *
 * The same value for every Google publisher — it identifies the ad system, not
 * the account — and the reason a copied line from someone else's file still
 * looks plausible. The account is the publisher ID below.
 */
export const GOOGLE_TAG_ID = 'f08c47fec0942fa0'

/**
 * The AdSense account authorized to sell this site's inventory.
 *
 * Public by definition: the file exists to publish it. It is a constant rather
 * than an environment variable because it never varies by deployment — a
 * staging host serving the same line authorizes nothing extra, since the record
 * only counts on the domain the ad request came from — and because a wrong
 * value here is a monetization outage that should be caught in review, not
 * discovered in a container's environment.
 *
 * Must match the ID AdSense shows under Sites → Ads.txt.
 */
export const ADSENSE_PUBLISHER_ID = 'pub-3878635086147352'

/** How the publisher's account with the ad system is held. */
export type SellerRelationship = 'DIRECT' | 'RESELLER'

export interface AdsTxtRecord {
  /** Canonical domain of the ad system, as it appears in bid requests. */
  adSystemDomain: string
  /** The publisher's account ID with that ad system. */
  publisherId: string
  /** `DIRECT` when the publisher controls the account; `RESELLER` when not. */
  relationship: SellerRelationship
  /** The ad system's ID in a certification authority registry, if it has one. */
  certificationAuthorityId?: string
}

/**
 * Every seller authorized for this domain.
 *
 * One entry today. Adding a network later — a second Google account, an
 * exchange reselling the inventory — means adding a record here; nothing else
 * in the file changes.
 */
export const ADS_TXT_RECORDS: readonly AdsTxtRecord[] = [
  {
    adSystemDomain: 'google.com',
    publisherId: ADSENSE_PUBLISHER_ID,
    relationship: 'DIRECT',
    certificationAuthorityId: GOOGLE_TAG_ID,
  },
]

/** The media type crawlers require; anything else is treated as no file. */
export const ADS_TXT_CONTENT_TYPE = 'text/plain; charset=utf-8'

/**
 * Render the file: one record per line, fields in the spec's order, separated
 * by `, ` and terminated by a newline.
 *
 * The certification authority ID is optional in the spec and omitted rather
 * than left empty when a record has none — a trailing separator with nothing
 * after it is a parse error for some crawlers, not an empty fourth field.
 */
export function renderAdsTxt(
  records: readonly AdsTxtRecord[] = ADS_TXT_RECORDS,
): string {
  return records
    .map((record) =>
      [
        record.adSystemDomain,
        record.publisherId,
        record.relationship,
        ...(record.certificationAuthorityId
          ? [record.certificationAuthorityId]
          : []),
      ].join(', '),
    )
    .map((line) => `${line}\n`)
    .join('')
}
