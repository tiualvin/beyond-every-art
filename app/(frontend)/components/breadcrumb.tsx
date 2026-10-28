import Link from 'next/link'

import type { Crumb } from '@/lib/seo/breadcrumbs'

/**
 * The trail above an article's title: Home › topic › title.
 *
 * It took the place of the topic eyebrow that sat there before, at the same
 * size and on the same single line, so the header is no taller than it was and
 * the featured image beside it — this template's LCP element — does not move.
 * The topic keeps the eyebrow's burgundy, so the one thing the old line said
 * is still the thing that stands out.
 *
 * One line at every width. On a phone the title is the part that gives way,
 * cut with an ellipsis rather than wrapped: the full title is the heading
 * directly beneath it, and a trail that wraps to three lines is a paragraph.
 *
 * The last crumb is a link to this page, marked `aria-current`, because the
 * BreadcrumbList this mirrors gives every item a URL, and the two are meant to
 * say the same thing — `lib/seo/breadcrumbs.ts`.
 */
export function Breadcrumb({ crumbs }: { crumbs: readonly Crumb[] }) {
  const last = crumbs.length - 1
  return (
    <nav aria-label="Breadcrumb" className="breadcrumb">
      <ol>
        {crumbs.map((crumb, index) => (
          <li
            key={crumb.path}
            className={
              index === last
                ? 'breadcrumb__current'
                : index > 0
                  ? 'breadcrumb__topic'
                  : undefined
            }
          >
            {index > 0 && (
              <span className="breadcrumb__sep" aria-hidden="true">
                ›
              </span>
            )}
            <Link
              href={crumb.path}
              aria-current={index === last ? 'page' : undefined}
            >
              {crumb.name}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  )
}
