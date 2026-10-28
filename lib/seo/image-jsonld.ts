// ImageObject JSON-LD for the images a body shows.
//
// Built from `collectBodyImages`, the same list the figures render from, so a
// node can only describe an image that is on the page, with the credit the
// page shows under it.

import type { ArticleBody } from '../content/body'
import { collectBodyImages } from '../content/body-image'
import { buildImageObjectJsonLd } from './jsonld'
import { absoluteUrl } from './site'

/**
 * One `ImageObject` per distinct body image that carries licensing.
 *
 * Only the rich-text branch: preserved Ghost HTML has no Media records behind
 * its images, so nothing to say about them — and on 28 Oct no migrated body
 * contained an inline image at all (`docs/SEO_AND_REDIRECTS.md`). A picture
 * placed twice is described once. Reads the body the page actually rendered,
 * so a restricted teaser describes only the images it shows.
 */
export function bodyImageJsonLd(
  body: ArticleBody,
  siteUrl: string,
): Record<string, unknown>[] {
  if (body.kind !== 'lexical') return []

  const seen = new Set<string>()
  const nodes: Record<string, unknown>[] = []
  for (const figure of collectBodyImages(body.content)) {
    const contentUrl = absoluteUrl(figure.image.url, siteUrl)
    if (seen.has(contentUrl)) continue
    seen.add(contentUrl)

    const node = buildImageObjectJsonLd({
      contentUrl,
      creator: figure.image.creator,
      creditText: figure.credit,
      copyrightNotice: figure.image.copyrightNotice,
      license: figure.image.licenseURL,
      acquireLicensePage: figure.image.acquireLicensePage,
    })
    if (node) nodes.push(node)
  }
  return nodes
}
