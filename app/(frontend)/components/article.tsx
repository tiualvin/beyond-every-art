import Link from 'next/link'

import type { PostDetail } from '@/lib/content/queries'
import { formatDate } from '@/lib/format'
import { tagPath } from '@/lib/seo/site'

export function Article({ post }: { post: PostDetail }) {
  const primaryTag = post.tags[0]
  const byline = [
    post.authors.map((a) => a.name).join(', '),
    formatDate(post.publishedAt),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <main>
      <article className="article">
        <div className="container article__inner">
          <header className="article__header">
            {primaryTag && (
              <Link href={tagPath(primaryTag.slug)} className="eyebrow">
                {primaryTag.name}
              </Link>
            )}
            <h1>{post.title}</h1>
            {post.excerpt && <p className="article__dek">{post.excerpt}</p>}
            {byline && <p className="article__byline">{byline}</p>}
          </header>

          {post.bodyHtml ? (
            // legacyHTML is first-party editorial content migrated from Ghost,
            // authored by trusted editors — rendered as the preserved body.
            <div
              className="prose"
              dangerouslySetInnerHTML={{ __html: post.bodyHtml }}
            />
          ) : (
            <p className="muted">This story has no body content yet.</p>
          )}

          {post.tags.length > 0 && (
            <footer className="article__tags">
              {post.tags.map((tag) => (
                <Link
                  key={tag.slug}
                  href={tagPath(tag.slug)}
                  className="tag-chip"
                >
                  {tag.name}
                </Link>
              ))}
            </footer>
          )}
        </div>
      </article>
    </main>
  )
}
