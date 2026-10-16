// Payload's stored shapes, reduced to the content contract by allow-list.
//
// The post reader runs at `depth: 2` with `overrideAccess`, which is what the
// website's article page needs and is far more than a client should see: an
// upload's value is the whole media document, a relationship or an internal
// link's value is the whole post it points at — a members-only post's full
// body, its `owners`, its `lastEditedBy` — and a signup block's campaign is the
// whole campaign row. Nothing here copies an object it was given. Every value
// in the output is built field by field from the contract's own list, so a
// field nobody listed cannot ride along, however it arrived.
//
// What the body already went through is not repeated: `toArticleBody` stripped
// the title heading and comment-only paragraphs, removed paywall markers and
// cut the teaser, and `withholdUnpublishedLinks` unlinked custom links to posts
// that are not live. That last one reads `fields.url` only, so an *internal*
// link — whose target is a populated document, not a URL — is checked for
// liveness here, against the document it carries.

import {
  BUTTON_ALIGNMENTS,
  BUTTON_VARIANTS,
  CALLOUT_TONES,
  FAQ_DEFAULT_HEADING,
  FEATURE_LIST_VARIANTS,
  GALLERY_LAYOUTS,
  MEDIA_SIDES,
  PULL_QUOTE_VARIANTS,
  type AccordionData,
  type BookmarkData,
  type ButtonData,
  type CalloutData,
  type ComparisonTableData,
  type EmbedData,
  type FaqData,
  type FeatureListData,
  type GalleryData,
  type KeyFactsData,
  type KeyTakeawaysData,
  type MediaTextData,
  type PullQuoteData,
  type SignupData,
} from '../../blocks/schema'
import { attributionHref } from '../content/attribution'
import type { ArticleBody } from '../content/body'
import { resolveEmbed, safeHref } from '../content/embed'
import {
  parseInlineMarkdown,
  type InlineNode as MarkdownNode,
} from '../content/inline-markdown'
import { toAltText, toMediaImage, type MediaImage } from '../content/media'
import { resolveSignupCopy } from '../content/signup-campaign'
import { siteSlugOf } from '../content/withheld-links'
import { isReservedRootSlug } from '../seo/reserved-slugs'
import { absoluteUrl, NEWSLETTER_PATH, postPath } from '../seo/site'
import {
  HEADING_TAGS,
  TEXT_FORMAT,
  type BlockFields,
  type Body,
  type BodyNode,
  type InlineNode,
  type ListItemNode,
  type ListNode,
  type Media,
} from './contract'

export type ProjectionContext = {
  /** The website's origin, without a trailing slash. */
  siteUrl: string
  now: Date
}

type Raw = Record<string, unknown>

const isRecord = (value: unknown): value is Raw =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : []

const text = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : ''

const optionalText = (value: unknown): string | null => text(value) || null

const oneOf = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T => (allowed.includes(value as T) ? (value as T) : fallback)

/** Every format bit Lexical defines, and none it does not. */
const KNOWN_FORMAT_BITS = Object.values(TEXT_FORMAT).reduce(
  (all, bit) => all | bit,
  0,
)

// --- Media ---------------------------------------------------------------

/** A media image the website already normalised, with absolute URLs. */
export function mediaFromImage(image: MediaImage, siteUrl: string): Media {
  return {
    url: absoluteUrl(image.url, siteUrl),
    alt: image.alt,
    width: image.width,
    height: image.height,
    cardUrl: image.cardUrl ? absoluteUrl(image.cardUrl, siteUrl) : null,
    ogUrl: image.ogUrl ? absoluteUrl(image.ogUrl, siteUrl) : null,
    credit: image.credit,
    // Built by the one module allowed to build a credit link.
    creditHref: attributionHref(image.creditURL),
  }
}

/** A populated upload value (a media document), or null for anything else. */
export function projectMediaDoc(
  value: unknown,
  siteUrl: string,
  altOverride?: unknown,
): Media | null {
  const image = toMediaImage(value)
  if (!image) return null
  const media = mediaFromImage(image, siteUrl)
  const override = toAltText(
    typeof altOverride === 'string' ? altOverride : null,
    isRecord(value) && typeof value.filename === 'string'
      ? value.filename
      : null,
  )
  return override ? { ...media, alt: override } : media
}

// --- Links ---------------------------------------------------------------

type LinkTarget =
  | { kind: 'internal'; slug: string; href: string }
  | { kind: 'external'; href: string }

/**
 * Where a stored URL goes, or null when it should not be a link at all.
 *
 * A one-segment path on the site is an article, linked by slug; a segment an
 * application route owns stays an ordinary link to the site. Anything that is
 * not http(s) or mailto — `javascript:` above all — and an anchor within the
 * page (the app has nothing to scroll to) become their words.
 */
export function projectHref(raw: unknown, siteUrl: string): LinkTarget | null {
  const value = text(raw)
  if (!value || value.startsWith('#')) return null

  let url: URL
  try {
    url = new URL(value, `${siteUrl}/`)
  } catch {
    return null
  }

  if (url.protocol === 'mailto:')
    return { kind: 'external', href: url.toString() }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null

  const slug = siteSlugOf(url.toString(), siteUrl)
  if (slug && !isReservedRootSlug(slug)) {
    return {
      kind: 'internal',
      slug,
      href: absoluteUrl(postPath(slug), siteUrl),
    }
  }
  return { kind: 'external', href: url.toString() }
}

/** An https URL, or null. */
function httpsOnly(raw: unknown): string | null {
  const value = text(raw)
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

/**
 * The slug of a populated document that a reader can open now, or null.
 *
 * Published, dated today or earlier (or undated, which the site treats as
 * public), and not in the trash: the same three conditions `live()` and
 * `onTheSite` apply, read off the document the link carries.
 */
function liveSlug(doc: unknown, now: Date): string | null {
  if (!isRecord(doc)) return null
  if (doc._status !== 'published' || doc.deletedAt) return null
  if (typeof doc.publishedAt === 'string' && doc.publishedAt) {
    const at = Date.parse(doc.publishedAt)
    if (Number.isFinite(at) && at > now.getTime()) return null
  }
  return text(doc.slug) || null
}

// --- Rich text -------------------------------------------------------------

function projectLink(node: Raw, context: ProjectionContext): InlineNode[] {
  const children = projectInline(asArray(node.children), context)
  const fields = isRecord(node.fields) ? node.fields : {}

  if (fields.linkType === 'internal') {
    const doc = isRecord(fields.doc) ? fields.doc : {}
    const relation = doc.relationTo
    const slug =
      relation === 'posts' || relation === 'pages'
        ? liveSlug(doc.value, context.now)
        : null
    return slug
      ? [
          {
            type: 'internalLink',
            slug,
            href: absoluteUrl(postPath(slug), context.siteUrl),
            children,
          },
        ]
      : children
  }

  const target = projectHref(fields.url ?? node.url, context.siteUrl)
  if (!target) return children
  return target.kind === 'internal'
    ? [{ type: 'internalLink', slug: target.slug, href: target.href, children }]
    : [{ type: 'link', href: target.href, children }]
}

export function projectInline(
  nodes: unknown[],
  context: ProjectionContext,
): InlineNode[] {
  return nodes.flatMap((value): InlineNode[] => {
    if (!isRecord(value)) return []
    switch (value.type) {
      case 'text':
        return typeof value.text === 'string'
          ? [
              {
                type: 'text',
                text: value.text,
                format:
                  typeof value.format === 'number'
                    ? value.format & KNOWN_FORMAT_BITS
                    : 0,
              },
            ]
          : []
      case 'tab':
        return [{ type: 'text', text: '\t', format: 0 }]
      case 'linebreak':
        return [{ type: 'linebreak' }]
      case 'link':
      case 'autolink':
        return projectLink(value, context)
      default:
        return []
    }
  })
}

function projectList(node: Raw, context: ProjectionContext): ListNode {
  const listType = oneOf(node.listType, ['bullet', 'number', 'check'], 'bullet')
  const start = Number.isInteger(node.start) ? (node.start as number) : 1
  return {
    type: 'list',
    listType,
    start,
    children: asArray(node.children)
      .filter((item): item is Raw => isRecord(item) && item.type === 'listitem')
      .map((item): ListItemNode => ({
        type: 'listitem',
        checked: listType === 'check' ? item.checked === true : null,
        children: asArray(item.children).flatMap(
          (child): (InlineNode | ListNode)[] =>
            isRecord(child) && child.type === 'list'
              ? [projectList(child, context)]
              : projectInline([child], context),
        ),
      })),
  }
}

/** A rich-text field inside a block: an editor state, or nothing. */
function projectRichText(
  value: unknown,
  context: ProjectionContext,
): BodyNode[] {
  const root = isRecord(value) && isRecord(value.root) ? value.root : null
  return root ? projectNodes(asArray(root.children), context) : []
}

export function projectNodes(
  nodes: unknown[],
  context: ProjectionContext,
): BodyNode[] {
  return nodes.flatMap((value): BodyNode[] => {
    if (!isRecord(value)) return []
    switch (value.type) {
      case 'paragraph':
        return [
          {
            type: 'paragraph',
            children: projectInline(asArray(value.children), context),
          },
        ]
      case 'heading':
        return [
          {
            type: 'heading',
            tag: oneOf(value.tag, HEADING_TAGS, 'h2'),
            children: projectInline(asArray(value.children), context),
          },
        ]
      case 'quote':
        return [
          {
            type: 'quote',
            children: projectInline(asArray(value.children), context),
          },
        ]
      case 'list':
        return [projectList(value, context)]
      case 'horizontalrule':
        return [{ type: 'horizontalrule' }]
      case 'upload': {
        if (value.relationTo !== 'media') return []
        const fields = isRecord(value.fields) ? value.fields : {}
        const media = projectMediaDoc(value.value, context.siteUrl, fields.alt)
        return media ? [{ type: 'upload', media }] : []
      }
      case 'block': {
        const fields = projectBlock(value.fields, context)
        return fields ? [{ type: 'block', fields }] : []
      }
      // Relationships, and any node type the contract does not name, are not
      // content a reader is sent.
      default:
        return []
    }
  })
}

// --- Blocks --------------------------------------------------------------

/** Inline Markdown from a table cell, as contract inline nodes. */
function fromMarkdown(
  nodes: MarkdownNode[],
  context: ProjectionContext,
  format = 0,
): InlineNode[] {
  return nodes.flatMap((node): InlineNode[] => {
    switch (node.type) {
      case 'text':
        return [{ type: 'text', text: node.text, format }]
      case 'code':
        return [
          { type: 'text', text: node.text, format: format | TEXT_FORMAT.code },
        ]
      case 'em':
        return fromMarkdown(node.children, context, format | TEXT_FORMAT.italic)
      case 'strong':
        return fromMarkdown(node.children, context, format | TEXT_FORMAT.bold)
      case 'link': {
        const children = fromMarkdown(node.children, context, format)
        const target = projectHref(node.href, context.siteUrl)
        if (!target) return children
        return target.kind === 'internal'
          ? [
              {
                type: 'internalLink',
                slug: target.slug,
                href: target.href,
                children,
              },
            ]
          : [{ type: 'link', href: target.href, children }]
      }
    }
  })
}

const cell = (value: unknown, context: ProjectionContext) =>
  fromMarkdown(
    parseInlineMarkdown(typeof value === 'string' ? value : ''),
    context,
  )

type Projector = (fields: Raw, context: ProjectionContext) => BlockFields | null

const PROJECTORS: Record<string, Projector> = {
  accordion: (raw, context) => {
    const data = raw as AccordionData
    const items = asArray(data.items)
      .filter(isRecord)
      .filter((item) => text(item.title))
      .map((item) => ({
        title: text(item.title),
        defaultOpen: item.defaultOpen === true,
        content: projectRichText(item.content, context),
      }))
    return items.length
      ? { blockType: 'accordion', heading: optionalText(data.heading), items }
      : null
  },
  pullQuote: (raw) => {
    const data = raw as PullQuoteData
    const quote = text(data.quote)
    return quote
      ? {
          blockType: 'pullQuote',
          quote,
          attribution: optionalText(data.attribution),
          sourceHref: httpsOnly(data.sourceURL),
          variant: oneOf(data.variant, PULL_QUOTE_VARIANTS, 'centered'),
        }
      : null
  },
  signup: (raw, context) => {
    // The copy a reader of the website would see: a live campaign's, field by
    // field, or the module's own. The campaign itself is not sent.
    const copy = resolveSignupCopy(raw as SignupData, context.now.getTime())
    return {
      blockType: 'signup',
      heading: copy.heading,
      body: optionalText(copy.body),
      href: absoluteUrl(NEWSLETTER_PATH, context.siteUrl),
    }
  },
  callout: (raw, context) => {
    const data = raw as CalloutData
    return {
      blockType: 'callout',
      emoji: optionalText(data.emoji),
      tone: oneOf(data.tone, CALLOUT_TONES, 'neutral'),
      content: projectRichText(data.content, context),
    }
  },
  button: (raw, context) => {
    const data = raw as ButtonData
    const label = text(data.label)
    const target = projectHref(safeHref(data.href), context.siteUrl)
    return label && target
      ? {
          blockType: 'button',
          label,
          href: target.href,
          variant: oneOf(data.variant, BUTTON_VARIANTS, 'primary'),
          align: oneOf(data.align, BUTTON_ALIGNMENTS, 'left'),
        }
      : null
  },
  gallery: (raw, context) => {
    const data = raw as GalleryData
    const items = asArray(data.items)
      .filter(isRecord)
      .flatMap((item) => {
        const media = projectMediaDoc(item.image, context.siteUrl)
        return media ? [{ media, caption: optionalText(item.caption) }] : []
      })
    return items.length
      ? {
          blockType: 'gallery',
          layout: oneOf(data.layout, GALLERY_LAYOUTS, 'grid'),
          caption: optionalText(data.caption),
          items,
        }
      : null
  },
  bookmark: (raw, context) => {
    const data = raw as BookmarkData
    const href = httpsOnly(data.url)
    const title = text(data.title)
    return href && title
      ? {
          blockType: 'bookmark',
          href,
          title,
          description: optionalText(data.description),
          publisher: optionalText(data.publisher),
          image: projectMediaDoc(data.image, context.siteUrl),
        }
      : null
  },
  embed: (raw) => {
    const data = raw as EmbedData
    const href = httpsOnly(data.url)
    if (!href) return null
    return {
      blockType: 'embed',
      href,
      title: text(data.title) || new URL(href).hostname,
      provider: resolveEmbed(href)?.provider ?? null,
    }
  },
  // Cut at and removed before the body gets here; never sent if it is not.
  paywall: () => null,
  keyTakeaways: (raw) => {
    const data = raw as KeyTakeawaysData
    const items = asArray(data.items)
      .filter(isRecord)
      .map((item) => text(item.text))
      .filter(Boolean)
    return items.length
      ? {
          blockType: 'keyTakeaways',
          heading: text(data.heading) || 'Key takeaways',
          items,
        }
      : null
  },
  faq: (raw, context) => {
    const data = raw as FaqData
    const items = asArray(data.items)
      .filter(isRecord)
      .filter((item) => text(item.question))
      .map((item) => ({
        question: text(item.question),
        answer: projectRichText(item.answer, context),
      }))
    return items.length
      ? {
          blockType: 'faq',
          heading: text(data.heading) || FAQ_DEFAULT_HEADING,
          items,
        }
      : null
  },
  featureList: (raw, context) => {
    const data = raw as FeatureListData
    const items = asArray(data.items)
      .filter(isRecord)
      .filter((item) => text(item.title))
      .map((item) => ({
        title: text(item.title),
        body: optionalText(item.body),
        image: projectMediaDoc(item.image, context.siteUrl),
      }))
    return items.length
      ? {
          blockType: 'featureList',
          heading: optionalText(data.heading),
          intro: optionalText(data.intro),
          variant: oneOf(data.variant, FEATURE_LIST_VARIANTS, 'list'),
          numbered: data.numbered !== false,
          items,
        }
      : null
  },
  mediaText: (raw, context) => {
    const data = raw as MediaTextData
    return {
      blockType: 'mediaText',
      media: projectMediaDoc(data.image, context.siteUrl),
      heading: optionalText(data.heading),
      body: projectRichText(data.body, context),
      imageSide: oneOf(data.imageSide, MEDIA_SIDES, 'left'),
    }
  },
  // The website's table, cell for cell (components/blocks/comparison-table.tsx):
  // a column or row with a blank label is not drawn, and each row has exactly
  // one cell per column, read by position. `columns` and each row's `cells` are
  // separate arrays in Payload, so deleting a column leaves its cell behind in
  // every row — stored, never shown on the page, and not to be sent here either.
  comparisonTable: (raw, context) => {
    const data = raw as ComparisonTableData
    const columns = asArray(data.columns)
      .filter(isRecord)
      .map((column) => text(column.label))
      .filter(Boolean)
    const rows = asArray(data.rows)
      .filter(isRecord)
      .filter((row) => text(row.label))
      .map((row) => {
        const stored = asArray(row.cells)
        return {
          label: cell(text(row.label), context),
          cells: columns.map((_column, index) => {
            const entry = stored[index]
            return cell(isRecord(entry) ? text(entry.value) : '', context)
          }),
        }
      })
    return columns.length && rows.length
      ? {
          blockType: 'comparisonTable',
          caption: text(data.caption),
          rowHeader: optionalText(data.rowHeader),
          columns,
          rows,
        }
      : null
  },
  keyFacts: (raw) => {
    const data = raw as KeyFactsData
    const items = asArray(data.items)
      .filter(isRecord)
      .map((item) => ({ label: text(item.label), value: text(item.value) }))
      .filter((item) => item.label && item.value)
    return items.length
      ? { blockType: 'keyFacts', heading: optionalText(data.heading), items }
      : null
  },
}

export function projectBlock(
  value: unknown,
  context: ProjectionContext,
): BlockFields | null {
  if (!isRecord(value) || typeof value.blockType !== 'string') return null
  const project = Object.hasOwn(PROJECTORS, value.blockType)
    ? PROJECTORS[value.blockType]
    : undefined
  return project ? project(value, context) : null
}

/** An article body as the contract carries it. */
export function projectBody(
  body: ArticleBody,
  context: ProjectionContext,
): Body {
  switch (body.kind) {
    case 'html':
      return { kind: 'html', html: body.html }
    case 'empty':
      return { kind: 'empty' }
    case 'lexical': {
      const nodes = projectNodes(asArray(body.content.root?.children), context)
      return nodes.length ? { kind: 'lexical', nodes } : { kind: 'empty' }
    }
  }
}
