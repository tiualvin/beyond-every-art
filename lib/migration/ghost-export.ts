// Types and helpers for reading a Ghost "Content & settings" JSON export.
// The export nests everything under `db[0].data`, with relationships expressed
// through join tables (`posts_authors`, `posts_tags`) rather than embedded
// arrays. Fields are intentionally optional because Ghost versions differ and
// the standard export is not guaranteed to contain every column.

export interface GhostUser {
  id: string
  name?: string
  slug?: string
  email?: string
  bio?: string | null
  website?: string | null
  profile_image?: string | null
}

export interface GhostTag {
  id: string
  name?: string
  slug?: string
  description?: string | null
  visibility?: string
  feature_image?: string | null
  meta_title?: string | null
  meta_description?: string | null
}

export interface GhostPost {
  id: string
  // Ghost stores posts and pages in the same table. Newer exports use
  // `type: 'page'`; older ones use `page: true`.
  type?: 'post' | 'page'
  page?: boolean
  status?: 'published' | 'draft' | 'scheduled'
  title?: string
  slug?: string
  html?: string | null
  custom_excerpt?: string | null
  feature_image?: string | null
  featured?: boolean | number
  visibility?: string
  created_at?: string | null
  updated_at?: string | null
  published_at?: string | null
  canonical_url?: string | null
  url?: string | null
}

export interface GhostPostMeta {
  post_id: string
  meta_title?: string | null
  meta_description?: string | null
  og_image?: string | null
  twitter_image?: string | null
}

export interface GhostJoin {
  post_id: string
  author_id?: string
  tag_id?: string
  sort_order?: number
}

export interface GhostData {
  posts?: GhostPost[]
  posts_meta?: GhostPostMeta[]
  posts_authors?: GhostJoin[]
  posts_tags?: GhostJoin[]
  tags?: GhostTag[]
  users?: GhostUser[]
}

export interface GhostExport {
  db: Array<{
    data: GhostData
    meta?: { version?: string; exported_on?: number }
  }>
}

export function parseGhostExport(value: unknown): GhostExport {
  if (
    !value ||
    typeof value !== 'object' ||
    !Array.isArray((value as GhostExport).db) ||
    !(value as GhostExport).db[0]?.data
  ) {
    throw new Error('Invalid Ghost export: expected db[0].data')
  }
  return value as GhostExport
}

export function ghostData(ghost: GhostExport): GhostData {
  return ghost.db[0].data
}

export function ghostVersion(ghost: GhostExport): string {
  return ghost.db[0].meta?.version ?? 'unknown'
}

/** Ghost keeps posts and pages in one table; treat `type`/`page` as the split. */
export function isGhostPage(post: GhostPost): boolean {
  return post.type === 'page' || post.page === true
}

export function summarizeGhostExport(ghost: GhostExport) {
  const data = ghostData(ghost)
  const posts = (data.posts ?? []).filter((post) => !isGhostPage(post))
  const seen = new Set<string>()
  const duplicateSlugs = posts
    .map((post) => post.slug)
    .filter(
      (slug): slug is string =>
        Boolean(slug) && (seen.has(slug!) || !seen.add(slug!)),
    )
  return {
    version: ghostVersion(ghost),
    posts: posts.length,
    pages: (data.posts ?? []).filter(isGhostPage).length,
    tags: data.tags?.length ?? 0,
    authors: data.users?.length ?? 0,
    duplicateSlugs: [...new Set(duplicateSlugs)],
  }
}
