// The trail above an article's title, and the BreadcrumbList that describes it.
//
// One function decides the trail and both the visible `<nav>` and the JSON-LD
// are built from its output. Google asks that breadcrumb markup match what a
// reader sees; deriving the two separately is how they stop matching.

import { isSubjectTag } from '../content/topics'
import { postPath, tagPath } from './site'

export type Crumb = {
  name: string
  /** Site-relative path, with the trailing slash every route here uses. */
  path: string
}

type TagLike = { name: string; slug: string }

/**
 * The tag an article is filed under, for the trail: its first public subject.
 *
 * Skips two kinds of tag that are not a place to go up to:
 *
 * - Ghost's internal tags, whose names start with `#`. Ghost never rendered
 *   them publicly, and none survive on this site as of October 2026 — the
 *   check is for an import that brings one back.
 * - Workflow tags (`featured`), which name a placement rather than a subject.
 *   `lib/content/topics.ts` is the list; "Home › Featured › …" says nothing
 *   about where a piece belongs.
 *
 * Null when nothing is left, and the trail is then Home › title.
 */
export function primaryTopic<T extends TagLike>(tags: readonly T[]): T | null {
  return (
    tags.find(
      (tag) =>
        tag.name &&
        tag.slug &&
        !tag.name.trim().startsWith('#') &&
        isSubjectTag(tag.slug),
    ) ?? null
  )
}

/** Home › {primary tag} › {title}, each pointing at the page it names. */
export function articleBreadcrumbs(post: {
  title: string
  slug: string
  tags: readonly TagLike[]
}): Crumb[] {
  const topic = primaryTopic(post.tags)
  return [
    { name: 'Home', path: '/' },
    ...(topic ? [{ name: topic.name, path: tagPath(topic.slug) }] : []),
    { name: post.title, path: postPath(post.slug) },
  ]
}
