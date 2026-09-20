// What needs an editor today, above the collection grid.
//
// The stock dashboard lists the collections that exist, which is the one thing
// an editor already knows. Everything below is derived from the database and
// none of it was reachable without knowing which filter to build by hand:
// articles published without a date, pieces waiting on a scheduled moment,
// published work with no excerpt or no cover, documents the Ghost import left
// in conflict.
//
// Each row is a count and a link into the list view already filtered to exactly
// those documents, so noticing a problem and opening it are the same click.
//
// Counted with `overrideAccess: false` and the signed-in user, so this obeys
// `access/roles.ts` like everything else: an author sees their own drafts and
// not the publication's. A dashboard that quietly ran as root would be the one
// place in the admin where the role model did not hold.
//
// Every count is wrapped. A panel that throws takes the whole dashboard down
// with it, and the dashboard is the first screen after login — so a failed
// count renders as a row that is absent, never as a CMS that will not load.

import type { Payload, TypedUser, Where } from 'payload'

import { notScheduled } from '../../lib/content/schedule'

type Props = {
  payload: Payload
  user?: TypedUser | null
}

type Row = {
  label: string
  /** What the number means, in a clause an editor can act on. */
  hint: string
  count: number
  href: string
  /** Rows that represent something wrong, rather than something in flight. */
  tone: 'wrong' | 'waiting' | 'normal'
}

/**
 * A Payload list-view URL with its filters already applied.
 *
 * The admin parses `where` out of the query string with the same syntax the
 * REST API uses, so a link can carry any filter the list view could build.
 */
function listUrl(collection: string, where: Where): string {
  const params = new URLSearchParams()
  const walk = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((entry, i) => walk(entry, `${path}[${i}]`))
      return
    }
    if (value && typeof value === 'object') {
      for (const [key, inner] of Object.entries(value as object)) {
        walk(inner, `${path}[${key}]`)
      }
      return
    }
    params.set(path, String(value))
  }
  walk(where, 'where')
  return `/admin/collections/${collection}?${params.toString()}`
}

const published: Where = { _status: { equals: 'published' } }

/** A count that never throws; a row that cannot be counted is not shown. */
async function count(
  payload: Payload,
  collection: 'posts' | 'pages' | 'media',
  where: Where,
  user?: TypedUser | null,
): Promise<number> {
  try {
    const result = await payload.count({
      collection,
      where,
      overrideAccess: false,
      user: user ?? undefined,
    })
    return result.totalDocs ?? 0
  } catch {
    return 0
  }
}

export async function EditorialDashboard({ payload, user }: Props) {
  const now = new Date()
  const future: Where = {
    and: [published, { publishedAt: { greater_than: now.toISOString() } }],
  }
  // The inverse of `notScheduled`: published, and carrying no date at all.
  // These are the documents that sort above everything else on the public site
  // — see `lib/content/schedule.ts` — so this row is the only place they are
  // visible as a set.
  const undated: Where = {
    and: [published, { publishedAt: { exists: false } }],
  }

  const [scheduled, missingDate, drafts, noExcerpt, noCover, noTags, troubled] =
    await Promise.all([
      count(payload, 'posts', future, user),
      count(payload, 'posts', undated, user),
      count(payload, 'posts', { _status: { equals: 'draft' } }, user),
      count(
        payload,
        'posts',
        { and: [published, notScheduled(now), { excerpt: { exists: false } }] },
        user,
      ),
      count(
        payload,
        'posts',
        {
          and: [
            published,
            notScheduled(now),
            { featuredImage: { exists: false } },
          ],
        },
        user,
      ),
      count(
        payload,
        'posts',
        { and: [published, notScheduled(now), { tags: { exists: false } }] },
        user,
      ),
      count(
        payload,
        'posts',
        { migrationStatus: { in: ['conflict', 'failed'] } },
        user,
      ),
    ])

  const rows: Row[] = [
    {
      label: 'published with no date',
      hint: 'These sort above every dated article on the site. Give each one a publish date.',
      count: missingDate,
      href: listUrl('posts', undated),
      tone: 'wrong' as const,
    },
    {
      label: 'left behind by the import',
      hint: 'The Ghost import marked these conflict or failed.',
      count: troubled,
      href: listUrl('posts', {
        migrationStatus: { in: ['conflict', 'failed'] },
      }),
      tone: 'wrong' as const,
    },
    {
      label: 'scheduled',
      hint: 'Published, waiting for the date to arrive. Nothing wakes up to release them — they appear once the page cache turns over.',
      count: scheduled,
      href: listUrl('posts', future),
      tone: 'waiting' as const,
    },
    {
      label: 'in draft',
      hint: 'Not on the site yet.',
      count: drafts,
      href: listUrl('posts', { _status: { equals: 'draft' } }),
      tone: 'normal' as const,
    },
    {
      label: 'live with no standfirst',
      hint: 'Their cards, feed items and share previews have no summary line.',
      count: noExcerpt,
      href: listUrl('posts', {
        and: [published, { excerpt: { exists: false } }],
      }),
      tone: 'wrong' as const,
    },
    {
      label: 'live with no cover',
      hint: 'Their cards render without an image in every listing.',
      count: noCover,
      href: listUrl('posts', {
        and: [published, { featuredImage: { exists: false } }],
      }),
      tone: 'wrong' as const,
    },
    {
      label: 'live with no tags',
      hint: 'These reach no tag archive and no "read next" list.',
      count: noTags,
      href: listUrl('posts', { and: [published, { tags: { exists: false } }] }),
      tone: 'normal' as const,
    },
  ].filter((row) => row.count > 0) satisfies Row[]

  return (
    <section className="bea-dash" aria-labelledby="bea-dash-heading">
      <div className="bea-dash__head">
        <h2 className="bea-dash__title" id="bea-dash-heading">
          Beyond Every Art
        </h2>
        <p className="bea-dash__sub">
          {rows.length === 0
            ? 'Nothing is waiting. Every published article has a date, a standfirst and a cover.'
            : 'What is waiting on somebody.'}
        </p>
      </div>

      {rows.length > 0 && (
        <ul className="bea-dash__rows">
          {rows.map((row) => (
            <li className="bea-dash__row" key={row.label}>
              <a
                className={`bea-dash__link bea-dash__link--${row.tone}`}
                href={row.href}
              >
                <span className="bea-dash__count">{row.count}</span>
                <span className="bea-dash__label">{row.label}</span>
              </a>
              <p className="bea-dash__hint">{row.hint}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default EditorialDashboard
