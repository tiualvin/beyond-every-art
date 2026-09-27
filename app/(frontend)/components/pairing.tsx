import Image from 'next/image'
import Link from 'next/link'

import { thumbnailSrc } from '@/lib/content/media'
import type { HomepageContent, PostCard } from '@/lib/content/queries'
import { formatDate } from '@/lib/format'
import { visibilityLabel } from '@/lib/membership'
import { postPath } from '@/lib/seo/site'

type Pairing = NonNullable<HomepageContent['pairing']>

/**
 * Two pieces that argue better together than apart, and the reason they do.
 *
 * This is the one module on the homepage a machine cannot produce. Everything
 * else here is a query with an order on it — newest, most flagged, largest
 * subject — and a reader can tell. A pairing is a claim: that these two, read
 * in sequence, add up to something neither makes alone. The note is the module;
 * the two articles are its evidence.
 *
 * It renders only when an editor has supplied all three parts, and the global
 * refuses to hand over a half-filled one — see `readHomepage`. A publication
 * with nothing to pair says nothing, which is the correct behaviour and also
 * the state it ships in.
 */
export function Pairing({ pairing }: { pairing: Pairing }) {
  return (
    <section className="section pairing" id="pairing">
      <div className="container">
        <div className="section__head">
          <div>
            <p className="eyebrow">Read together</p>
            <h2>{pairing.title}</h2>
          </div>
          <p className="section__note">
            A pairing from the archive, chosen because the second piece answers
            a question the first one leaves open.
          </p>
        </div>

        <div className="pairing__grid">
          {pairing.posts.map((post) => (
            <PairedArticle key={post.id} post={post} />
          ))}
        </div>

        <p className="pairing__note">
          {pairing.note}
          <cite>Editor&rsquo;s note</cite>
        </p>
      </div>
    </section>
  )
}

function PairedArticle({ post }: { post: PostCard }) {
  const meta = [
    visibilityLabel(post.visibility),
    post.publishedAt ? formatDate(post.publishedAt) : null,
    `${post.readingTime} min`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Link href={postPath(post.slug)} className="pairing__item">
      {post.image ? (
        <span className="pairing__plate">
          <Image
            src={thumbnailSrc(post.image)}
            alt=""
            fill
            sizes="(max-width: 51rem) 100vw, 34rem"
            style={{ objectFit: 'cover' }}
          />
        </span>
      ) : (
        <span className="pairing__plate plate-wash" />
      )}

      <span className="eyebrow">
        {post.tags[0]?.name ?? 'From the archive'}
      </span>
      <h3 className="pairing__title">{post.title}</h3>
      {/* Always present, even when empty. The two columns are aligned row by
          row with subgrid, which lines up only while both items have the same
          number of children — and an editor pairing a piece that carries no
          standfirst with one that does is not hypothetical here: half the
          recent archive has no excerpt. An absent one holds its row rather
          than pulling the metadata line up out of step with its neighbour. */}
      {post.excerpt ? (
        <span className="pairing__excerpt">{post.excerpt}</span>
      ) : (
        <span className="pairing__excerpt" aria-hidden="true" />
      )}
      <span className="pairing__meta">{meta}</span>
    </Link>
  )
}
