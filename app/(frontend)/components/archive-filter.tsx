'use client'

import { useMemo, useState } from 'react'

import type { PostCard } from '@/lib/content/queries'
import { pigmentFor } from '@/lib/design/pigments'

import { ArchiveGroups } from './archive-groups'

type Topic = { slug: string; name: string; count: number }

function topicsIn(posts: PostCard[]): Topic[] {
  const found = new Map<string, Topic>()
  for (const post of posts) {
    for (const tag of post.tags) {
      const topic = found.get(tag.slug)
      if (topic) topic.count += 1
      else found.set(tag.slug, { slug: tag.slug, name: tag.name, count: 1 })
    }
  }
  return [...found.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  )
}

/**
 * The journal's topic filter and the list it narrows.
 *
 * It filters the page it is on rather than re-querying, which is how the
 * prototype behaves and what its empty state says. That keeps pagination,
 * canonical URLs and the crawlable archive exactly as they were — a filter
 * that changed the query would need its own URLs and its own pagination, and
 * a reader who wants a whole subject already has the topic page.
 */
export function ArchiveFilter({ posts }: { posts: PostCard[] }) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string[]>([])

  const topics = useMemo(() => topicsIn(posts), [posts])
  const visible = useMemo(
    () =>
      selected.length === 0
        ? posts
        : posts.filter((post) =>
            post.tags.some((tag) => selected.includes(tag.slug)),
          ),
    [posts, selected],
  )

  function toggle(slug: string) {
    setSelected((current) =>
      current.includes(slug)
        ? current.filter((s) => s !== slug)
        : [...current, slug],
    )
  }

  return (
    <>
      <div className="toolbar">
        <button
          className="filter-toggle"
          type="button"
          aria-expanded={open}
          aria-controls="filter-pane"
          onClick={() => setOpen(!open)}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
          Filter
          {selected.length > 0 && (
            <span className="filter-toggle__badge">{selected.length}</span>
          )}
        </button>
        <p className="toolbar__status" role="status">
          {visible.length} {visible.length === 1 ? 'piece' : 'pieces'}
        </p>
      </div>

      <div className="filter-pane" id="filter-pane" hidden={!open}>
        <fieldset className="filter-pane__set">
          <legend>Topic</legend>
          <div className="filter-pane__options">
            {topics.map((topic) => (
              <label className="filter-option" key={topic.slug}>
                <input
                  type="checkbox"
                  checked={selected.includes(topic.slug)}
                  onChange={() => toggle(topic.slug)}
                />
                {/* The ring carries the pale pigments — Lead White on paper is
                    otherwise a dot you cannot see. */}
                <i style={{ background: pigmentFor(topic.slug).hex }} />
                {topic.name}
                <span className="filter-option__count">{topic.count}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="filter-pane__foot">
          <button
            className="filter-clear"
            type="button"
            onClick={() => setSelected([])}
          >
            Clear all
          </button>
          <button
            className="button button--primary button--compact"
            type="button"
            onClick={() => setOpen(false)}
          >
            Done
          </button>
        </div>
      </div>

      {visible.length > 0 ? (
        <ArchiveGroups posts={visible} />
      ) : (
        <p className="archive__empty">
          Nothing on this page matches that filter.
          <button
            className="filter-clear"
            type="button"
            onClick={() => setSelected([])}
          >
            Clear the filter
          </button>
        </p>
      )}
    </>
  )
}
