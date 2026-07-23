export interface GhostRecord {
  id: string
  slug?: string
  title?: string
}
export interface GhostExport {
  db: Array<{
    data: { posts?: GhostRecord[]; tags?: GhostRecord[]; users?: GhostRecord[] }
    meta?: { version?: string }
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

export function summarizeGhostExport(ghost: GhostExport) {
  const data = ghost.db[0].data
  const posts = data.posts ?? []
  const seen = new Set<string>()
  const duplicateSlugs = posts
    .map((post) => post.slug)
    .filter(
      (slug): slug is string =>
        Boolean(slug) && (seen.has(slug!) || !seen.add(slug!)),
    )
  return {
    version: ghost.db[0].meta?.version ?? 'unknown',
    posts: posts.length,
    tags: data.tags?.length ?? 0,
    authors: data.users?.length ?? 0,
    duplicateSlugs: [...new Set(duplicateSlugs)],
  }
}
