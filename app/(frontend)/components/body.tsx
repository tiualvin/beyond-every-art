import { RichText } from '@payloadcms/richtext-lexical/react'

import { splitHtmlForAds, splitLexicalForAds } from '@/lib/ads/inline'
import type { ArticleBody as ArticleBodyValue } from '@/lib/content/body'
import type { PostCard } from '@/lib/content/queries'

import { AdUnit } from './ad-unit'
import { InlinePromo } from './inline-promo'
import { buildConverters } from './blocks/registry'

/**
 * A document body, rendered whichever way it is stored.
 *
 * The two branches are not interchangeable and the split is the point of this
 * component. Rich text becomes typed React nodes, so an insertable module is a
 * real component with behavior. Preserved Ghost markup keeps going through
 * `dangerouslySetInnerHTML` exactly as it always has — that path is unchanged,
 * still the reason `lib/security/csp.ts` exists, and never sees a block.
 *
 * **In-article ads interleave with both**, when `adClient` is given, at the
 * boundaries `lib/ads/inline.ts` picks. Without it every line below renders
 * exactly what it rendered before, which is what a Page and a restricted
 * teaser get.
 *
 * **Each slot carries a piece to show when no ad is served.** They arrive as
 * data and are turned into elements here, on the server, because `AdUnit` is
 * the only thing that can know whether an ad came and has no business knowing
 * what goes there if it did not — the same division `ArticleRail` makes for the
 * rail's box. One piece per slot, in order, and a slot past the end of the list
 * gets none: `AdUnit` leaves a childless slot alone entirely, so a short list
 * costs nothing rather than repeating itself. `docs/ADVERTISING.md` §8.
 *
 * The two branches need different shapes and it is worth knowing why, because
 * the HTML one looks like the odd one out and is not arbitrary:
 *
 * - **Rich text** hands each part to its own `RichText`, all inside one
 *   `.prose`. `RichText` renders its children straight into the parent, so
 *   several of them produce exactly the children one of them would have —
 *   none of `.prose`'s direct-child rules can tell the difference.
 * - **HTML** cannot do that: `dangerouslySetInnerHTML` needs an element to
 *   hang on, so each chunk is its own `.prose`. That is fine for the rules
 *   that match direct children — a paragraph is still a direct child of a
 *   `.prose` — and wrong for exactly one thing, the drop cap, which targets
 *   `.prose > p:first-of-type` and would otherwise land a 3.6em burgundy
 *   letter after every ad. `.prose--continued` in `app/globals.css` turns it
 *   off for every chunk after the first, the same way a body opening with a
 *   module already does.
 */
export function ArticleBody({
  body,
  className = 'prose',
  preview = false,
  emptyMessage,
  adClient = null,
  inlinePromos = [],
}: {
  body: ArticleBodyValue
  className?: string
  preview?: boolean
  emptyMessage?: string
  /** The publisher to run in-article units for, or null for none. */
  adClient?: string | null
  /**
   * One piece per in-article slot, for the slots no ad fills.
   *
   * The tail of the pool `lib/content/related.ts` divides. Shorter than the
   * number of slots is an ordinary state on a thin archive, not an error.
   */
  inlinePromos?: PostCard[]
}) {
  if (body.kind === 'empty') {
    return emptyMessage ? <p className="muted">{emptyMessage}</p> : null
  }

  if (body.kind === 'html') {
    const chunks = adClient ? splitHtmlForAds(body.html) : [body.html]

    return (
      <>
        {chunks.map((chunk, index) => (
          <ArticleBodyChunk key={index}>
            {index > 0 && (
              <InlineSlot client={adClient!} promo={inlinePromos[index - 1]} />
            )}
            <div
              className={
                index === 0 ? className : `${className} prose--continued`
              }
              dangerouslySetInnerHTML={{ __html: chunk }}
            />
          </ArticleBodyChunk>
        ))}
      </>
    )
  }

  const parts = adClient ? splitLexicalForAds(body.content) : [body.content]

  return (
    <div className={className}>
      {parts.map((part, index) => (
        <ArticleBodyChunk key={index}>
          {index > 0 && (
            <InlineSlot client={adClient!} promo={inlinePromos[index - 1]} />
          )}
          <RichText
            data={part as never}
            converters={buildConverters(preview)}
            disableContainer
          />
        </ArticleBodyChunk>
      ))}
    </div>
  )
}

/**
 * One in-article unit, and the piece it shows when no ad is served.
 *
 * Both body branches render this, so what a slot holds is decided once. The
 * promo is optional and deliberately so: `AdUnit` only watches a slot it was
 * given children for, so a slot with nothing to show stays exactly the box it
 * was before any of this existed rather than becoming an emptier one.
 */
function InlineSlot({ client, promo }: { client: string; promo?: PostCard }) {
  return (
    <AdUnit placement="article-inline" client={client}>
      {promo && <InlinePromo post={promo} />}
    </AdUnit>
  )
}

/**
 * A fragment, named so the two branches above read the same.
 *
 * It exists because a keyed list of two siblings needs a parent, and the one
 * thing this must not introduce is a real element: an extra `<div>` around
 * each chunk would put the body's paragraphs a level below `.prose` and take
 * the justification, the rhythm and the drop cap with them.
 */
function ArticleBodyChunk({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
