import Link from 'next/link'

import type { Pagination } from '@/lib/content/pagination'

/**
 * Newer / older links between the pages of an archive.
 *
 * Plain `<a href>` elements, server-rendered, with `rel="prev"`/`"next"`: the
 * point of paginating a hub is that a crawler can walk from page 1 to every
 * article under it, and a button that loads more in script is a page a crawler
 * never reaches. Renders nothing for a single page.
 */
export function ArchivePagination({
  pagination,
  label,
}: {
  pagination: Pagination
  /** Names the nav for a screen reader: "Journal pages", "Palette pages". */
  label: string
}) {
  if (pagination.totalPages <= 1) return null

  return (
    <nav className="pagination" aria-label={label}>
      {pagination.prevPath ? (
        <Link
          href={pagination.prevPath}
          className="button button--ghost"
          rel="prev"
        >
          Newer stories
        </Link>
      ) : (
        <span />
      )}
      <p className="pagination__status">
        Page {pagination.page} of {pagination.totalPages}
      </p>
      {pagination.nextPath ? (
        <Link
          href={pagination.nextPath}
          className="button button--ghost"
          rel="next"
        >
          Older stories
        </Link>
      ) : (
        <span />
      )}
    </nav>
  )
}
