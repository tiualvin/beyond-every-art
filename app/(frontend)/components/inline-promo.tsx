import Link from 'next/link'

import type { PostCard } from '@/lib/content/queries'
import { visibilityLabel } from '@/lib/membership'
import { postPath } from '@/lib/seo/site'

/**
 * What an in-body ad slot holds when no ad is served.
 *
 * `docs/ADVERTISING.md` §8: the reserved height is held whether or not Google
 * fills it, so without this a reader gets a labelled empty box — which is most
 * readers while an ad account is new, and every reader running a blocker. The
 * rail has had this for one box; an article has up to six.
 *
 * **One piece per slot, and never the same piece twice.** Six of one promo
 * would be worse than six empty boxes. The supply is the tail of the pool
 * `lib/content/related.ts` divides — "Read next" takes the head — so each slot
 * down the article carries a different piece and none of them is the one the
 * reader will meet again at the end.
 *
 * **A band, not a card, and that is the whole of the visual argument.** Every
 * insertable module an author can drop in this column is a bordered or filled
 * card: `callout`, `bookmark`, `signup`. That is the vocabulary of "the writer
 * put this here", and the way to sit outside it is not to be a card. So this is
 * ruled top and bottom and carries no surface, with the eyebrow — which none of
 * those blocks has and every rail promo does — saying whose voice it is. It
 * still reads as not-body-text, because nothing else in a reading column is
 * ruled across the measure.
 *
 * **Spans, not headings and paragraphs**, the way `Bookmark` does it and for
 * the same reason, with one more reason here. The two body branches put this in
 * different places: rich text renders the slot inside `.prose`, preserved Ghost
 * markup renders it as a sibling of one. A `<h3>` or a `<p>` would therefore
 * pick up `.prose`'s type on one branch and not the other, and the same
 * component would look like two components depending on how the article was
 * stored. Every property the band needs is declared in `app/globals.css`
 * instead of inherited.
 *
 * It costs a reader who gets an ad nothing. The markup ships either way, but it
 * sits in a `display: none` subtree until the slot is known to be empty — out
 * of the accessibility tree with it, so a screen reader is not offered six
 * links to pieces nobody can see.
 */
export function InlinePromo({ post }: { post: PostCard }) {
  // Subject, gate, length — one line, joined the way the rail joins its own.
  // The tag goes here rather than above the headline as a second eyebrow: two
  // lines of uppercase micro-type stacked in a 280px box is the box spending
  // its height on labels. The membership word is the part that earns its place
  // rather than decorating, because it tells a reader the piece is gated before
  // they spend a tap on it.
  const meta = [
    post.tags[0]?.name,
    visibilityLabel(post.visibility),
    post.readingTime ? `${post.readingTime} min` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="inline-promo">
      {/* Not "Read next", which closes the article, and not the rail's "Worth
          reading", which a desktop reader has in view on the same screen. */}
      <p className="eyebrow inline-promo__label">Also from Beyond Every Art</p>
      <Link href={postPath(post.slug)} className="inline-promo__item">
        <span className="inline-promo__title">{post.title}</span>
        {post.excerpt && (
          <span className="inline-promo__excerpt">{post.excerpt}</span>
        )}
        {meta && <span className="inline-promo__meta">{meta}</span>}
      </Link>
    </div>
  )
}
