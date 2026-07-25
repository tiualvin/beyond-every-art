export type ArticleJsonLdInput = {
  url: string
  headline: string
  description?: string
  datePublished?: string | null
  dateModified?: string | null
  authors?: string[]
  /** Absolute URL of the featured image, when the post has one. */
  image?: string | null
  siteName: string
  siteUrl: string
}

/**
 * Builds a schema.org Article object for a post. Pure so it can be unit tested;
 * the route serializes it into a <script type="application/ld+json"> tag.
 */
export function buildArticleJsonLd(
  input: ArticleJsonLdInput,
): Record<string, unknown> {
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    mainEntityOfPage: { '@type': 'WebPage', '@id': input.url },
    headline: input.headline,
    url: input.url,
    publisher: {
      '@type': 'Organization',
      name: input.siteName,
      url: input.siteUrl,
    },
  }

  if (input.description) jsonLd.description = input.description
  if (input.datePublished) jsonLd.datePublished = input.datePublished
  if (input.dateModified) jsonLd.dateModified = input.dateModified
  // schema.org accepts a single URL, but Google's Article guidance asks for a
  // list, and a list of one stays valid for both.
  if (input.image) jsonLd.image = [input.image]

  const authors = (input.authors ?? []).filter(Boolean)
  if (authors.length > 0) {
    jsonLd.author = authors.map((name) => ({ '@type': 'Person', name }))
  }

  return jsonLd
}

/**
 * Serializes a JSON-LD object for safe inline embedding, escaping the
 * characters that could otherwise break out of a <script> element.
 */
export function serializeJsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
}
