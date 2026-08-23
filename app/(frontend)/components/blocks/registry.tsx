import type {
  JSXConverterArgs,
  JSXConverters,
} from '@payloadcms/richtext-lexical/react'

import {
  ACCORDION_BLOCK,
  BOOKMARK_BLOCK,
  BUTTON_BLOCK,
  CALLOUT_BLOCK,
  EMBED_BLOCK,
  GALLERY_BLOCK,
  PAYWALL_BLOCK,
  PULL_QUOTE_BLOCK,
  SIGNUP_BLOCK,
  type AccordionData,
  type BlockSlug,
  type BookmarkData,
  type ButtonData,
  type CalloutData,
  type EmbedData,
  type GalleryData,
  type PaywallData,
  type PullQuoteData,
  type SignupData,
} from '@/blocks/schema'
import { createAnchorAllocator, headingText } from '@/lib/content/headings'
import { Accordion } from './accordion'
import { Bookmark } from './bookmark'
import { ActionButton } from './button'
import { Callout } from './callout'
import { Embed } from './embed'
import { Gallery } from './gallery'
import { PaywallMarker } from './paywall'
import { PullQuote } from './pull-quote'
import { Signup } from './signup'
import { UnknownNode } from './unknown'

/**
 * The one place a block slug is turned into a component.
 *
 * Typed as `Record<BlockSlug, …>` on purpose: adding a slug to `BLOCK_SLUGS`
 * without adding a renderer here is a type error rather than a block that
 * silently disappears from published articles. This is also the reason the
 * mapping is not a switch statement copied into each route.
 */
type BlockRenderers = Record<
  BlockSlug,
  (fields: Record<string, unknown>, preview: boolean) => React.ReactNode
>

const renderers: BlockRenderers = {
  [ACCORDION_BLOCK]: (fields, preview) => (
    <Accordion data={fields as AccordionData} preview={preview} />
  ),
  [PULL_QUOTE_BLOCK]: (fields) => <PullQuote data={fields as PullQuoteData} />,
  [SIGNUP_BLOCK]: (fields) => <Signup data={fields as SignupData} />,
  [CALLOUT_BLOCK]: (fields) => <Callout data={fields as CalloutData} />,
  [BUTTON_BLOCK]: (fields) => <ActionButton data={fields as ButtonData} />,
  [GALLERY_BLOCK]: (fields) => <Gallery data={fields as GalleryData} />,
  [BOOKMARK_BLOCK]: (fields) => <Bookmark data={fields as BookmarkData} />,
  [EMBED_BLOCK]: (fields) => <Embed data={fields as EmbedData} />,
  // Reaching a renderer at all means the body kept the marker, which only
  // happens in preview — `toArticleBody` strips it everywhere else.
  [PAYWALL_BLOCK]: (fields) => <PaywallMarker data={fields as PaywallData} />,
}

type UnknownNodeShape = {
  type?: string
  fields?: { blockType?: string }
}

/**
 * A heading node, as much of one as an anchor needs.
 *
 * Payload types `node.children` as `SerializedLexicalNode[]`, which carries no
 * `text` — the text lives on the concrete text-node subtype. Reading it is
 * therefore a narrowing the shared type cannot express, so the node is widened
 * to this shape at the single point where `headingText` is called.
 */
type HeadingTextNode = {
  text?: string
  children?: HeadingTextNode[]
}

/**
 * A heading, with an `id` derived from its own text.
 *
 * Payload's default heading converter emits a bare `<h2>`, which cannot be
 * linked to. The reasoning for anchoring them is in `lib/content/headings.ts`.
 *
 * The allocator is created per converter set — that is, once per rendered
 * document — because uniqueness is a property of one page's markup. A module
 * scoped allocator would leak anchors between requests and, worse, start
 * numbering the first article's headings from wherever the last one stopped.
 *
 * Anchors deliberately come from the heading's *text* rather than its position,
 * so `#binders-and-behaviour` survives an editor inserting a section above it.
 * Rewording the heading does change the anchor, which is the honest trade: an
 * anchor is a name for what the section says.
 */
function headingConverter(allocate: (text: string) => string) {
  // Named rather than an arrow so `react/display-name` can tell this is a
  // converter the renderer calls, not a component it mounts.
  return function convertHeading({
    node,
    nodesToJSX,
  }: JSXConverterArgs<{ tag?: string; children?: unknown[] }>) {
    const Tag = (node.tag ?? 'h2') as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
    const children = nodesToJSX({ nodes: (node.children ?? []) as never })
    return (
      <Tag id={allocate(headingText(node as HeadingTextNode))}>{children}</Tag>
    )
  }
}

/**
 * Converters for a body, with this project's blocks registered.
 *
 * `preview` is threaded through rather than read from a hook because these run
 * on the server, inside an RSC render, where there is no request context to ask.
 */
export function buildConverters(preview: boolean) {
  return ({
    defaultConverters,
  }: {
    defaultConverters: JSXConverters
  }): JSXConverters => ({
    ...defaultConverters,
    heading: headingConverter(createAnchorAllocator()),
    blocks: Object.fromEntries(
      Object.entries(renderers).map(([slug, render]) => [
        slug,
        ({ node }: { node: { fields?: Record<string, unknown> } }) =>
          render(node.fields ?? {}, preview),
      ]),
    ),
    // Catches both unknown block slugs and node types nothing converts, which
    // is why it is registered even though every known slug is handled above.
    unknown: ({ node }: { node: UnknownNodeShape }) => (
      <UnknownNode
        nodeType={node.type ?? 'unknown'}
        blockType={node.fields?.blockType ?? null}
        preview={preview}
      />
    ),
  })
}
