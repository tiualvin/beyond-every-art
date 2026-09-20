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
  /**
   * False for a post whose body is withheld from anonymous readers. Google
   * asks paywalled pages to say so, which is what separates a teaser from
   * cloaking — serving a crawler more than a reader gets.
   */
  isAccessibleForFree?: boolean
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

  if (input.isAccessibleForFree === false) jsonLd.isAccessibleForFree = false
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

export type WebSiteJsonLdInput = {
  siteName: string
  siteUrl: string
  description?: string
  /** Where `/search/?q=` lives, when the site has a search page to advertise. */
  searchPath?: string
}

/**
 * The homepage's `WebSite` node.
 *
 * Ghost emitted one and this site emitted nothing, which the 18 Sep crawl
 * comparison caught as `structured_data_types_changed` on `/`. `AGENTS.md`
 * lists structured data among the things the migration preserves, so the
 * absence was a regression rather than a simplification.
 *
 * `potentialAction` is included only when a search path is supplied. It is the
 * one part of this node Google acts on — the sitelinks search box — and
 * advertising a search endpoint that does not exist is worse than advertising
 * none.
 */
export function buildWebSiteJsonLd(
  input: WebSiteJsonLdInput,
): Record<string, unknown> {
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: input.siteName,
    url: input.siteUrl,
    publisher: {
      '@type': 'Organization',
      name: input.siteName,
      url: input.siteUrl,
    },
  }

  if (input.description) jsonLd.description = input.description

  if (input.searchPath) {
    const target = `${input.siteUrl.replace(/\/$/, '')}${input.searchPath}?q={search_term_string}`
    jsonLd.potentialAction = {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: target },
      // schema.org requires this exact literal rather than a property name;
      // it names the variable inside `urlTemplate`, and Google ignores the
      // action entirely when it does not match.
      'query-input': 'required name=search_term_string',
    }
  }

  return jsonLd
}

export type WebPageJsonLdInput = {
  url: string
  name: string
  description?: string
  dateModified?: string | null
  siteName: string
  siteUrl: string
}

/**
 * A static page's node — `WebPage`, deliberately not `Article`.
 *
 * Ghost emitted `Article` here, and this does not, which is the one place the
 * migration knowingly departs from what Ghost served. The route already said
 * why in a comment that predates this function: "A page has no Article node —
 * it is not an article." An about page is not editorial, and `Article` carries
 * expectations — author, publication date, a headline that is news — that a
 * page cannot honour. Claiming the type to match a crawl diff would be lying
 * to a crawler in order to make a report look tidy.
 *
 * `WebPage` closes the real gap, which was emitting nothing at all.
 */
export function buildWebPageJsonLd(
  input: WebPageJsonLdInput,
): Record<string, unknown> {
  return pageLikeJsonLd('WebPage', input)
}

export type CollectionPageJsonLdInput = {
  url: string
  name: string
  description?: string
  siteName: string
  siteUrl: string
}

/**
 * A tag archive's node — `CollectionPage`, where Ghost emitted `Series`.
 *
 * The same reasoning as `buildWebPageJsonLd`, applied to the fourth route kind.
 * A `Series` is a work published in parts, in a deliberate order, by an author
 * who meant it as a series. A tag archive is a list of everything filed under a
 * word — no order, no intent, and a post can sit in several at once.
 * `CollectionPage` is what schema.org offers for exactly that, so it is what
 * this emits.
 *
 * Found on 18 Sep by the crawl comparison, which reported nine of these as
 * `Series` against `(none)`. The pass that added the homepage, page and author
 * nodes the same day covered three route kinds and missed this one.
 */
export function buildCollectionPageJsonLd(
  input: CollectionPageJsonLdInput,
): Record<string, unknown> {
  return pageLikeJsonLd('CollectionPage', input)
}

/**
 * The shape `WebPage` and `CollectionPage` share: a named page, owned by the
 * site, optionally described and optionally dated.
 *
 * Factored rather than written twice because the two differ only in `@type`,
 * and two near-identical builders is how one of them quietly stops matching
 * the other.
 */
function pageLikeJsonLd(
  type: 'WebPage' | 'CollectionPage',
  input: WebPageJsonLdInput | CollectionPageJsonLdInput,
): Record<string, unknown> {
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': type,
    name: input.name,
    url: input.url,
    isPartOf: {
      '@type': 'WebSite',
      name: input.siteName,
      url: input.siteUrl,
    },
  }

  if (input.description) jsonLd.description = input.description
  const dateModified = (input as WebPageJsonLdInput).dateModified
  if (dateModified) jsonLd.dateModified = dateModified

  return jsonLd
}

export type ProfilePageJsonLdInput = {
  url: string
  name: string
  description?: string
  siteName: string
  siteUrl: string
}

/**
 * An author archive's node: a `ProfilePage` whose `mainEntity` is the `Person`.
 *
 * Ghost emitted a bare `Person`. This wraps it, because the page is not the
 * person — it is a page about them, and `ProfilePage` is the type schema.org
 * added to say exactly that. The `Person` Ghost emitted is still there, as the
 * `mainEntity`, so anything reading for it still finds it.
 */
export function buildProfilePageJsonLd(
  input: ProfilePageJsonLdInput,
): Record<string, unknown> {
  const person: Record<string, unknown> = {
    '@type': 'Person',
    name: input.name,
    url: input.url,
  }
  if (input.description) person.description = input.description

  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    url: input.url,
    mainEntity: person,
    isPartOf: {
      '@type': 'WebSite',
      name: input.siteName,
      url: input.siteUrl,
    },
  }
}

export type ItemListJsonLdInput = {
  /** Absolute URLs, in the order the page lists them. */
  items: readonly { url: string; name: string }[]
  /** What the list is, for a consumer reading more than the members. */
  name?: string
}

/**
 * The articles a listing page names, in the order it names them.
 *
 * The homepage served a `WebSite` node and nothing about its contents, so the
 * one thing the page is for — a reader's way into the archive — was the part a
 * crawler had to infer from markup. `ItemList` states it: these pieces, this
 * order. Each entry is a bare `url`, which is what Google asks for when the
 * target page carries its own `Article` node; every post page here does
 * (`buildArticleJsonLd`), so repeating the article's fields in the list would
 * be a second copy to keep in step for no gain.
 *
 * Returns the node whether or not the list is empty. An empty `itemListElement`
 * is still true of a site with nothing published, and a builder that sometimes
 * returns nothing pushes the decision into every caller.
 */
export function buildItemListJsonLd(
  input: ItemListJsonLdInput,
): Record<string, unknown> {
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: input.items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: item.url,
      name: item.name,
    })),
  }

  if (input.name) jsonLd.name = input.name

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
