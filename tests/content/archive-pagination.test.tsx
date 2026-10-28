import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { ArchivePagination } from '../../app/(frontend)/components/archive-pagination'
import { buildPagination } from '../../lib/content/pagination'

// What `next.config.ts`'s `trailingSlash: true` compiles into the app. Without
// it `next/link` renders `/tag/palette` here and `/tag/palette/` in production,
// and these tests are about the exact hrefs a crawler follows.
vi.stubEnv('__NEXT_TRAILING_SLASH', 'true')

// A hub is only a hub if a crawler can walk from its first page to every
// article under it. These are the links that let it.
describe('ArchivePagination', () => {
  const render = (page: number, totalPages: number) =>
    renderToStaticMarkup(
      <ArchivePagination
        pagination={buildPagination({
          basePath: '/tag/art/',
          page,
          totalPages,
        })}
        label="Art pages"
      />,
    )

  it('renders nothing for a single page', () => {
    expect(render(1, 1)).toBe('')
  })

  it('links page 1 onward with a plain href and rel="next"', () => {
    const html = render(1, 2)
    expect(html).toContain('aria-label="Art pages"')
    expect(html).toMatch(/<a[^>]*rel="next"[^>]*href="\/tag\/art\/\?page=2"/)
    expect(html).not.toContain('rel="prev"')
  })

  // Back to the bare path, never `?page=1`: page 1 has one URL, the one
  // search engines already hold.
  it('links the last page back to the bare archive path', () => {
    const html = render(2, 2)
    expect(html).toMatch(/<a[^>]*rel="prev"[^>]*href="\/tag\/art\/"/)
    expect(html).not.toContain('?page=1')
    expect(html).not.toContain('rel="next"')
  })
})
