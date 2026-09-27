// What a tag archive tells search engines and share cards about itself.
//
// The tag page used to send the tag's `description` and nothing else — and all
// ten tags on the live site have an empty one, so every topic page went out
// with no meta description and no share image. Meanwhile the fields an editor
// would fill to fix that (`metaTitle`, `metaDescription`, `featuredImage`, all
// on the Tags collection since the migration) were read by nothing.
//
// So this answers from the most deliberate source available, in order: what an
// editor wrote for search, then what they wrote for readers, then a sentence
// built from the archive's own articles. The last is plain on purpose — a count
// and the newest titles, which is true, specific to the page, and better than
// leaving the snippet to whatever text a crawler happens to pick off the cards.
// It is a floor, not a substitute: writing the descriptions is still the fix.
//
// Pure, so it is unit tested without a database (`tests/seo/topic-meta.test.ts`).

import type { MediaImage } from '@/lib/content/media'

/**
 * Where search results cut a snippet. Google's limit is in pixels rather than
 * characters, but 160 is the conventional ceiling and keeps the sentence whole.
 */
export const DESCRIPTION_LIMIT = 160

/** How many titles a generated description names at most. */
const TITLES_NAMED = 3

export type TopicMetaInput = {
  name: string
  description: string
  metaTitle: string | null
  metaDescription: string | null
  image: MediaImage | null
  /** Newest first, as the archive query returns them. */
  posts: ReadonlyArray<{ title: string; image: MediaImage | null }>
}

export type TopicMeta = {
  /**
   * The document title. An editor's `metaTitle` is used as written, the way a
   * post's is; the tag's name keeps the ` - Beyond Every Art` suffix that
   * Ghost gave generated archives.
   */
  title: string | { absolute: string }
  description: string | undefined
  /** The tag's own image, else the newest article's that has one. */
  image: MediaImage | null
}

export function topicMeta(input: TopicMetaInput, siteTitle: string): TopicMeta {
  return {
    title: input.metaTitle ? { absolute: input.metaTitle } : input.name,
    description:
      oneLine(input.metaDescription ?? '') ||
      oneLine(input.description) ||
      describeTopic(input.name, input.posts, siteTitle),
    image: input.image ?? input.posts.find((post) => post.image)?.image ?? null,
  }
}

/**
 * "12 articles on Palette from Beyond Every Art, including “A”, “B” and “C”."
 *
 * Names as many of the newest titles as fit inside `DESCRIPTION_LIMIT`, and
 * falls back to the count alone when not even one does. Undefined for an empty
 * archive, which has nothing true to say.
 */
export function describeTopic(
  name: string,
  posts: ReadonlyArray<{ title: string }>,
  siteTitle: string,
): string | undefined {
  const count = posts.length
  if (count === 0) return undefined

  const lead = `${count} ${count === 1 ? 'article' : 'articles'} on ${oneLine(name)} from ${siteTitle}`
  const titles = posts.map((post) => `“${oneLine(post.title)}”`)

  for (let named = Math.min(TITLES_NAMED, count); named > 0; named--) {
    const list = joinTitles(titles.slice(0, named))
    const sentence =
      named === count ? `${lead}: ${list}.` : `${lead}, including ${list}.`
    if (sentence.length <= DESCRIPTION_LIMIT) return sentence
  }
  return `${lead}.`
}

function joinTitles(titles: string[]): string {
  if (titles.length <= 1) return titles.join('')
  return `${titles.slice(0, -1).join(', ')} and ${titles[titles.length - 1]}`
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}
