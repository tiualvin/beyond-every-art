// Pure transformation from a parsed Ghost export into a "migration plan".
//
// The plan is a database-free description of exactly what the importer will
// write: one entry per author, tag, post, and page, with relationships already
// resolved to Ghost IDs and conflicts surfaced up front. Keeping this layer
// pure makes the risky mapping logic fully unit-testable and lets `--dry-run`
// report everything without touching Postgres.

import {
  ghostData,
  ghostVersion,
  isGhostPage,
  type GhostExport,
  type GhostPost,
} from './ghost-export'
import { collectMediaUrls } from './media'

export type ContentStatus = 'draft' | 'published'
export type Visibility = 'public' | 'members' | 'paid'

export interface AuthorPlan {
  ghostID: string
  data: {
    name: string
    slug: string
    bio?: string
    website?: string
    ghostID: string
  }
  profileImageURL?: string
}

export interface TagPlan {
  ghostID: string
  data: {
    name: string
    slug: string
    description?: string
    metaTitle?: string
    metaDescription?: string
    ghostID: string
  }
  featureImageURL?: string
}

export interface PostPlan {
  ghostID: string
  slug: string
  status: ContentStatus
  authorGhostIDs: string[]
  tagGhostIDs: string[]
  featureImageURL?: string
  mediaURLs: string[]
  data: {
    title: string
    slug: string
    publishedAt?: string
    ghostUpdatedAt?: string
    excerpt?: string
    legacyHTML?: string
    metaTitle?: string
    metaDescription?: string
    canonicalURL?: string
    featured: boolean
    visibility: Visibility
    ghostID: string
    ghostURL?: string
  }
}

export interface PagePlan {
  ghostID: string
  slug: string
  status: ContentStatus
  featureImageURL?: string
  mediaURLs: string[]
  data: {
    title: string
    slug: string
    publishedAt?: string
    legacyHTML?: string
    metaTitle?: string
    metaDescription?: string
    canonicalURL?: string
    ghostID: string
  }
}

export interface MigrationConflicts {
  // Slugs that repeat within a single target collection (Payload enforces
  // uniqueness, so these must be reconciled before a real import).
  duplicateSlugs: string[]
  // Ghost author IDs referenced by posts but absent from the users export.
  missingAuthors: string[]
  // Ghost tag IDs referenced by posts but absent from the tags export.
  missingTags: string[]
}

export interface MigrationPlan {
  version: string
  authors: AuthorPlan[]
  tags: TagPlan[]
  posts: PostPlan[]
  pages: PagePlan[]
  media: string[]
  conflicts: MigrationConflicts
}

function undef<T>(value: T | null | undefined): T | undefined {
  return value === null || value === undefined ? undefined : value
}

function toStatus(status: GhostPost['status']): ContentStatus {
  // Scheduled posts have no live URL yet; import them as drafts and let editors
  // re-schedule inside Payload rather than silently publishing them.
  return status === 'published' ? 'published' : 'draft'
}

function toVisibility(visibility: string | undefined): Visibility {
  return visibility === 'members' || visibility === 'paid'
    ? visibility
    : 'public'
}

function groupJoin(
  joins: Array<{ post_id: string; sort_order?: number }> | undefined,
  key: 'author_id' | 'tag_id',
): Map<string, string[]> {
  const map = new Map<string, string[]>()
  const withOrder = new Map<string, Array<{ id: string; order: number }>>()
  for (const join of joins ?? []) {
    const id = (join as Record<string, unknown>)[key]
    if (typeof id !== 'string') continue
    const list = withOrder.get(join.post_id) ?? []
    list.push({ id, order: join.sort_order ?? list.length })
    withOrder.set(join.post_id, list)
  }
  for (const [postId, list] of withOrder) {
    map.set(
      postId,
      list.sort((a, b) => a.order - b.order).map((entry) => entry.id),
    )
  }
  return map
}

function collectDuplicates(slugs: string[]): string[] {
  const seen = new Set<string>()
  const dupes = new Set<string>()
  for (const slug of slugs) {
    if (seen.has(slug)) dupes.add(slug)
    else seen.add(slug)
  }
  return [...dupes]
}

/** Build the full, database-free migration plan from a parsed Ghost export. */
export function buildMigrationPlan(ghost: GhostExport): MigrationPlan {
  const data = ghostData(ghost)
  const media = new Set<string>()

  const authors: AuthorPlan[] = (data.users ?? []).map((user) => {
    if (user.profile_image) media.add(user.profile_image)
    return {
      ghostID: user.id,
      profileImageURL: undef(user.profile_image),
      data: {
        name: user.name ?? user.slug ?? user.id,
        slug: user.slug ?? user.id,
        bio: undef(user.bio),
        website: undef(user.website),
        ghostID: user.id,
      },
    }
  })

  const tags: TagPlan[] = (data.tags ?? []).map((tag) => {
    if (tag.feature_image) media.add(tag.feature_image)
    return {
      ghostID: tag.id,
      featureImageURL: undef(tag.feature_image),
      data: {
        name: tag.name ?? tag.slug ?? tag.id,
        slug: tag.slug ?? tag.id,
        description: undef(tag.description),
        metaTitle: undef(tag.meta_title),
        metaDescription: undef(tag.meta_description),
        ghostID: tag.id,
      },
    }
  })

  const authorIds = new Set(authors.map((author) => author.ghostID))
  const tagIds = new Set(tags.map((tag) => tag.ghostID))

  const metaByPost = new Map(
    (data.posts_meta ?? []).map((meta) => [meta.post_id, meta]),
  )
  const authorsByPost = groupJoin(data.posts_authors, 'author_id')
  const tagsByPost = groupJoin(data.posts_tags, 'tag_id')

  const posts: PostPlan[] = []
  const pages: PagePlan[] = []
  const missingAuthors = new Set<string>()
  const missingTags = new Set<string>()

  for (const post of data.posts ?? []) {
    const meta = metaByPost.get(post.id)
    const slug = post.slug ?? post.id
    const html = undef(post.html)
    const socialImage = undef(meta?.og_image) ?? undef(meta?.twitter_image)
    const mediaURLs = collectMediaUrls(html, post.feature_image, socialImage)
    for (const url of mediaURLs) media.add(url)

    if (isGhostPage(post)) {
      pages.push({
        ghostID: post.id,
        slug,
        status: toStatus(post.status),
        featureImageURL: undef(post.feature_image),
        mediaURLs,
        data: {
          title: post.title ?? slug,
          slug,
          publishedAt: undef(post.published_at),
          legacyHTML: html,
          metaTitle: undef(meta?.meta_title),
          metaDescription: undef(meta?.meta_description),
          canonicalURL: undef(post.canonical_url),
          ghostID: post.id,
        },
      })
      continue
    }

    const authorGhostIDs = authorsByPost.get(post.id) ?? []
    const tagGhostIDs = tagsByPost.get(post.id) ?? []
    for (const id of authorGhostIDs)
      if (!authorIds.has(id)) missingAuthors.add(id)
    for (const id of tagGhostIDs) if (!tagIds.has(id)) missingTags.add(id)

    posts.push({
      ghostID: post.id,
      slug,
      status: toStatus(post.status),
      // Only keep relationships that actually resolve to an imported record.
      authorGhostIDs: authorGhostIDs.filter((id) => authorIds.has(id)),
      tagGhostIDs: tagGhostIDs.filter((id) => tagIds.has(id)),
      featureImageURL: undef(post.feature_image),
      mediaURLs,
      data: {
        title: post.title ?? slug,
        slug,
        publishedAt: undef(post.published_at),
        ghostUpdatedAt: undef(post.updated_at),
        excerpt: undef(post.custom_excerpt),
        legacyHTML: html,
        metaTitle: undef(meta?.meta_title),
        metaDescription: undef(meta?.meta_description),
        canonicalURL: undef(post.canonical_url),
        featured: Boolean(post.featured),
        visibility: toVisibility(post.visibility),
        ghostID: post.id,
        ghostURL: undef(post.url),
      },
    })
  }

  const duplicateSlugs = [
    ...collectDuplicates(posts.map((post) => post.slug)),
    ...collectDuplicates(pages.map((page) => page.slug)),
  ]

  return {
    version: ghostVersion(ghost),
    authors,
    tags,
    posts,
    pages,
    media: [...media],
    conflicts: {
      duplicateSlugs,
      missingAuthors: [...missingAuthors],
      missingTags: [...missingTags],
    },
  }
}

/** Compact, serializable summary of a plan for migration reports. */
export function summarizePlan(plan: MigrationPlan) {
  return {
    version: plan.version,
    authors: plan.authors.length,
    tags: plan.tags.length,
    posts: plan.posts.length,
    pages: plan.pages.length,
    drafts: [...plan.posts, ...plan.pages].filter(
      (item) => item.status === 'draft',
    ).length,
    media: plan.media.length,
    duplicateSlugs: plan.conflicts.duplicateSlugs,
    missingAuthors: plan.conflicts.missingAuthors,
    missingTags: plan.conflicts.missingTags,
  }
}
