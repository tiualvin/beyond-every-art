/** Posts shown per page on the journal archive. */
export const ARCHIVE_PAGE_SIZE = 12

export type Pagination = {
  /** The page actually rendered, clamped into range. */
  page: number
  totalPages: number
  prevPath: string | null
  nextPath: string | null
}

/**
 * Reads a `?page=` search parameter. Anything that is not a whole number of at
 * least 1 — missing, blank, negative, fractional, or junk — means the first
 * page, so a hand-edited URL degrades to the archive rather than an error.
 */
export function parsePageParam(
  value: string | string[] | undefined | null,
): number {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== 'string') return 1

  const trimmed = raw.trim()
  if (!trimmed) return 1

  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed) || parsed < 1) return 1
  return parsed
}

/**
 * The path of one page of an archive. Page 1 stays on the bare path so the
 * archive has a single canonical URL rather than two that serve the same list.
 */
export function archivePagePath(basePath: string, page: number): string {
  return page <= 1 ? basePath : `${basePath}?page=${page}`
}

/** Previous/next links for a paginated archive, with the page clamped in range. */
export function buildPagination({
  basePath,
  page,
  totalPages,
}: {
  basePath: string
  page: number
  totalPages: number
}): Pagination {
  const pages = Number.isFinite(totalPages)
    ? Math.max(1, Math.floor(totalPages))
    : 1
  const current = Number.isFinite(page)
    ? Math.min(Math.max(1, Math.floor(page)), pages)
    : 1

  return {
    page: current,
    totalPages: pages,
    prevPath: current > 1 ? archivePagePath(basePath, current - 1) : null,
    nextPath: current < pages ? archivePagePath(basePath, current + 1) : null,
  }
}
