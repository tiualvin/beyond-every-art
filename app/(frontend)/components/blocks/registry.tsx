import type {
  JSXConverterArgs,
  JSXConverters,
} from '@payloadcms/richtext-lexical/react'

import {
  ACCORDION_BLOCK,
  BOOKMARK_BLOCK,
  BUTTON_BLOCK,
  CALLOUT_BLOCK,
  COMPARISON_TABLE_BLOCK,
  EMBED_BLOCK,
  FAQ_BLOCK,
  FEATURE_LIST_BLOCK,
  GALLERY_BLOCK,
  KEY_TAKEAWAYS_BLOCK,
  MEDIA_TEXT_BLOCK,
  PAYWALL_BLOCK,
  PULL_QUOTE_BLOCK,
  SIGNUP_BLOCK,
  type AccordionData,
  type BlockSlug,
  type BookmarkData,
  type ButtonData,
  type CalloutData,
  type ComparisonTableData,
  type EmbedData,
  type FaqData,
  type FeatureListData,
  type GalleryData,
  type KeyTakeawaysData,
  type MediaTextData,
  type PaywallData,
  type PullQuoteData,
  type SignupData,
} from '@/blocks/schema'
import { createAnchorAllocator, headingText } from '@/lib/content/headings'
import { Accordion } from './accordion'
import { Bookmark } from './bookmark'
import { ActionButton } from './button'
import { Callout } from './callout'
import { ComparisonTable } from './comparison-table'
import { Embed } from './embed'
import { Faq } from './faq'
import { FeatureList } from './feature-list'
import { Gallery } from './gallery'
import { KeyTakeaways } from './key-takeaways'
import { MediaText } from './media-text'
import { PaywallMarker } from './paywall'
import { PullQuote } from './pull-quote'
import { Signup } from './signup'
import { UnknownNode } from './unknown'

/**
 * What a block renderer is given beyond its own stored fields.
 *
 * `allocate` is the page's heading-anchor allocator, shared with the body's own
 * headings rather than one per block. Uniqueness is a property of the whole
 * document: an FAQ asking "Method?" inside an article that already has a
 * "Method" section would otherwise emit the same id twice, and a duplicate id
 * makes both anchors resolve to whichever the browser met first.
 */
type BlockContext = {
  preview: boolean
  allocate: (text: string) => string
}

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
  (fields: Record<string, unknown>, context: BlockContext) => React.ReactNode
>

const renderers: BlockRenderers = {
  [ACCORDION_BLOCK]: (fields, { preview }) => (
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

  // Anchors are allocated here rather than inside each component so that every
  // id on the page comes from one counter, in render order.
  [KEY_TAKEAWAYS_BLOCK]: (fields, { allocate }) => {
    const data = fields as KeyTakeawaysData
    return (
      <KeyTakeaways
        data={data}
        anchor={allocate(data.heading?.trim() || 'Key takeaways')}
      />
    )
  },
  [FAQ_BLOCK]: (fields, { allocate, preview }) => {
    const data = fields as FaqData
    // The heading is allocated first because it renders first; the questions
    // follow in their own order. Allocating in reading order is what keeps a
    // `-2` suffix landing on the later of two identical headings.
    const headingAnchor = allocate(
      data.heading?.trim() || 'Frequently asked questions',
    )
    const anchors = (data.items ?? []).map((item) =>
      allocate(item?.question?.trim() || 'question'),
    )
    return (
      <Faq
        data={data}
        anchors={anchors}
        headingAnchor={headingAnchor}
        preview={preview}
      />
    )
  },
  // Nothing to allocate: a table's caption is a caption, not a heading.
  [COMPARISON_TABLE_BLOCK]: (fields) => (
    <ComparisonTable data={fields as ComparisonTableData} />
  ),
  [MEDIA_TEXT_BLOCK]: (fields, { allocate }) => {
    const data = fields as MediaTextData
    const heading = data.heading?.trim()
    return <MediaText data={data} anchor={heading ? allocate(heading) : ''} />
  },
  [FEATURE_LIST_BLOCK]: (fields, { allocate }) => {
    const data = fields as FeatureListData
    const heading = data.heading?.trim()
    // Allocated only when there is a heading to carry it, so an unheaded list
    // does not silently consume `section` and push a later one to `section-2`.
    const headingAnchor = heading ? allocate(heading) : ''
    const anchors = (data.items ?? []).map((item) =>
      allocate(item?.title?.trim() || 'item'),
    )
    return (
      <FeatureList
        data={data}
        anchors={anchors}
        headingAnchor={headingAnchor}
      />
    )
  },
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
  }): JSXConverters => {
    // One allocator for the whole document, shared by the body's own headings
    // and by every block that emits one. Created here, so it is per render.
    const context: BlockContext = {
      preview,
      allocate: createAnchorAllocator(),
    }

    return {
      ...defaultConverters,
      heading: headingConverter(context.allocate),
      blocks: Object.fromEntries(
        Object.entries(renderers).map(([slug, render]) => [
          slug,
          ({ node }: { node: { fields?: Record<string, unknown> } }) =>
            render(node.fields ?? {}, context),
        ]),
      ),
      // Catches both unknown block slugs and node types nothing converts,
      // which is why it is registered even though every known slug is handled
      // above.
      unknown: ({ node }: { node: UnknownNodeShape }) => (
        <UnknownNode
          nodeType={node.type ?? 'unknown'}
          blockType={node.fields?.blockType ?? null}
          preview={preview}
        />
      ),
    }
  }
}
