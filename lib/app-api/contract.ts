// The companion app's content API: every endpoint, and what each one answers.
//
// The canonical copy. The website's handlers under `app/app-api/v1/` answer in
// these shapes, and the app reads a copy of this file that `pnpm
// companion:sync` writes into `apps/companion/src/generated/contract.ts` —
// held to it by `tests/companion/sync.test.ts`. That copy is why this file
// imports nothing but zod: it has to mean the same thing on both sides of the
// repository, and `zod/v4` is the one import both have (the website's zod 3.25
// ships zod 4 at that subpath). See docs/COMPANION_APP.md.
//
// What the API serves is what the website shows a signed-out reader, already
// processed on the server: live posts only, a gated post's teaser and never the
// rest, links to unpublished articles unlinked, the leading title heading and
// comment-only paragraphs removed. A client renders a body as received. Running
// those rules again is not a safeguard, it is a second opinion that can only
// disagree — re-stripping a title would remove a real heading that happens to
// share its wording.
//
// Every path ends in `/`. The website runs `trailingSlash: true`, and an
// unslashed URL is a 308 per request.

import { z } from 'zod/v4'

/** The path every endpoint is served under. */
export const API_PREFIX = '/app-api/v1/'

/** What a page of posts holds unless the request asks otherwise. */
export const DEFAULT_PAGE_SIZE = 12

/** The most posts one page will ever hold, whatever the request asks. */
export const MAX_PAGE_SIZE = 24

/** The longest search term the server will look for; longer is truncated. */
export const MAX_SEARCH_LENGTH = 64

/** Paths relative to {@link API_PREFIX}. Slugs are encoded; every one is slashed. */
export const apiPaths = {
  posts: (page = 1, limit = DEFAULT_PAGE_SIZE) =>
    `posts/?page=${page}&limit=${limit}`,
  post: (slug: string) => `posts/${encodeURIComponent(slug)}/`,
  tags: () => 'tags/',
  tag: (slug: string) => `tags/${encodeURIComponent(slug)}/`,
  authors: () => 'authors/',
  author: (slug: string) => `authors/${encodeURIComponent(slug)}/`,
  search: (query: string) => `search/?q=${encodeURIComponent(query)}`,
} as const

// --- Values ---------------------------------------------------------------

const parsesAs = (value: string, protocols: readonly string[]): boolean => {
  try {
    return protocols.includes(new URL(value).protocol)
  } catch {
    return false
  }
}

/** An absolute http(s) URL. Plain http only ever appears against a local server. */
export const WebUrlSchema = z
  .string()
  .refine(
    (value) => parsesAs(value, ['https:', 'http:']),
    'absolute http(s) URL',
  )

/** An absolute https URL: where a credit, a source or a bookmark points. */
export const HttpsUrlSchema = z
  .string()
  .refine((value) => parsesAs(value, ['https:']), 'absolute https URL')

/** A link a reader may follow: the web, or an email address. */
export const LinkHrefSchema = z
  .string()
  .refine(
    (value) => parsesAs(value, ['https:', 'http:', 'mailto:']),
    'absolute http(s) or mailto URL',
  )

const IsoDateSchema = z
  .string()
  .refine((value) => Number.isFinite(Date.parse(value)), 'ISO 8601 date')

export const VisibilitySchema = z.enum(['public', 'members', 'paid'])
export type Visibility = z.infer<typeof VisibilitySchema>

/**
 * An image, wherever it appears: a featured image, an upload in a body, a
 * gallery item. Exactly these keys and no others — a media document carries
 * far more than a reader needs, and none of the rest is anybody's business.
 *
 * Every URL is absolute. `cardUrl` (768px wide) and `ogUrl` (1200×630) are
 * null for an upload that predates the size. `creditHref` is built on the
 * server by the only code allowed to build one (lib/content/attribution.ts);
 * a client renders it or renders the credit as text, and never builds its own.
 */
export const MediaSchema = z.object({
  url: WebUrlSchema,
  alt: z.string(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  cardUrl: WebUrlSchema.nullable(),
  ogUrl: WebUrlSchema.nullable(),
  credit: z.string().nullable(),
  creditHref: HttpsUrlSchema.nullable(),
})
export type Media = z.infer<typeof MediaSchema>

// --- Rich text ------------------------------------------------------------
//
// An allow-listed projection of Payload's Lexical JSON: the same node types and
// the same nesting, with only the keys a reader needs. Uploads carry a `Media`,
// internal links carry a slug and an href, and blocks carry their own projected
// fields — never the populated documents the server read them from.

/**
 * Lexical's text-format bits, which `TextNode.format` carries as a sum.
 * Lexical's own encoding, kept so a body reads the same as the stored one.
 */
export const TEXT_FORMAT = {
  bold: 1,
  italic: 2,
  strikethrough: 4,
  underline: 8,
  code: 16,
  subscript: 32,
  superscript: 64,
  highlight: 128,
} as const

export type TextNode = { type: 'text'; text: string; format: number }
export type LineBreakNode = { type: 'linebreak' }
/** A link off the site, or to a page of it that is not an article. */
export type LinkNode = { type: 'link'; href: string; children: InlineNode[] }
/** A link to a document on the site. Its slug and its URL, and nothing else. */
export type InternalLinkNode = {
  type: 'internalLink'
  slug: string
  href: string
  children: InlineNode[]
}
/**
 * Never sent. What a client puts in place of a node type it does not know, so
 * one new kind of node costs that node rather than the article. See
 * {@link markUnsupported}.
 */
export type UnsupportedNode = {
  type: 'unsupported'
  nodeType: string
  blockType: string | null
}

export type InlineNode =
  TextNode | LineBreakNode | LinkNode | InternalLinkNode | UnsupportedNode

export const HEADING_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const

export type ParagraphNode = { type: 'paragraph'; children: InlineNode[] }
export type HeadingNode = {
  type: 'heading'
  tag: (typeof HEADING_TAGS)[number]
  children: InlineNode[]
}
export type QuoteNode = { type: 'quote'; children: InlineNode[] }
export type ListItemNode = {
  type: 'listitem'
  /** Null outside a checklist. */
  checked: boolean | null
  /** Text, and any list nested under this item. */
  children: (InlineNode | ListNode)[]
}
export type ListNode = {
  type: 'list'
  listType: 'bullet' | 'number' | 'check'
  start: number
  children: ListItemNode[]
}
export type HorizontalRuleNode = { type: 'horizontalrule' }
export type UploadNode = { type: 'upload'; media: Media }
export type BlockNode = { type: 'block'; fields: BlockFields }

export type BodyNode =
  | ParagraphNode
  | HeadingNode
  | QuoteNode
  | ListNode
  | HorizontalRuleNode
  | UploadNode
  | BlockNode
  | UnsupportedNode

// --- Blocks ---------------------------------------------------------------
//
// One shape per insertable module, keyed by the slug in blocks/schema.ts.
// `paywall` is listed because it is a block an editor can place; the server
// cuts the body at it and removes it, so it never reaches a client, and a
// client that somehow receives one renders nothing.

export type AccordionBlock = {
  blockType: 'accordion'
  heading: string | null
  items: { title: string; defaultOpen: boolean; content: BodyNode[] }[]
}
export type PullQuoteBlock = {
  blockType: 'pullQuote'
  quote: string
  attribution: string | null
  sourceHref: string | null
  variant: 'centered' | 'bordered' | 'large'
}
/** The newsletter module, as copy and a link to the website's signup page. */
export type SignupBlock = {
  blockType: 'signup'
  heading: string
  body: string | null
  href: string
}
export type CalloutBlock = {
  blockType: 'callout'
  emoji: string | null
  tone: 'accent' | 'neutral' | 'dark'
  content: BodyNode[]
}
export type ButtonBlock = {
  blockType: 'button'
  label: string
  href: string
  variant: 'primary' | 'secondary'
  align: 'left' | 'center'
}
export type GalleryBlock = {
  blockType: 'gallery'
  layout: 'grid' | 'rows'
  caption: string | null
  items: { media: Media; caption: string | null }[]
}
export type BookmarkBlock = {
  blockType: 'bookmark'
  href: string
  title: string
  description: string | null
  publisher: string | null
  image: Media | null
}
/** A video, as a link: `provider` is null for a URL the website would not frame. */
export type EmbedBlock = {
  blockType: 'embed'
  href: string
  title: string
  provider: 'youtube' | 'vimeo' | null
}
export type PaywallBlock = { blockType: 'paywall' }
export type KeyTakeawaysBlock = {
  blockType: 'keyTakeaways'
  heading: string
  items: string[]
}
export type FaqBlock = {
  blockType: 'faq'
  heading: string
  items: { question: string; answer: BodyNode[] }[]
}
export type FeatureListBlock = {
  blockType: 'featureList'
  heading: string | null
  intro: string | null
  variant: 'list' | 'steps'
  numbered: boolean
  items: { title: string; body: string | null; image: Media | null }[]
}
export type MediaTextBlock = {
  blockType: 'mediaText'
  media: Media | null
  heading: string | null
  body: BodyNode[]
  imageSide: 'left' | 'right'
}
/** Cells are inline rich text: the website reads them as inline Markdown. */
export type ComparisonTableBlock = {
  blockType: 'comparisonTable'
  caption: string
  rowHeader: string | null
  columns: string[]
  rows: { label: InlineNode[]; cells: InlineNode[][] }[]
}
export type KeyFactsBlock = {
  blockType: 'keyFacts'
  heading: string | null
  items: { label: string; value: string }[]
}

export type BlockFields =
  | AccordionBlock
  | PullQuoteBlock
  | SignupBlock
  | CalloutBlock
  | ButtonBlock
  | GalleryBlock
  | BookmarkBlock
  | EmbedBlock
  | PaywallBlock
  | KeyTakeawaysBlock
  | FaqBlock
  | FeatureListBlock
  | MediaTextBlock
  | ComparisonTableBlock
  | KeyFactsBlock

/** Every block type the contract describes, in blocks/schema.ts order. */
export const BLOCK_TYPES = [
  'accordion',
  'pullQuote',
  'signup',
  'callout',
  'button',
  'gallery',
  'bookmark',
  'embed',
  'paywall',
  'keyTakeaways',
  'faq',
  'featureList',
  'mediaText',
  'comparisonTable',
  'keyFacts',
] as const satisfies readonly BlockFields['blockType'][]

const UnsupportedNodeSchema = z.object({
  type: z.literal('unsupported'),
  nodeType: z.string(),
  blockType: z.string().nullable(),
})

export const InlineNodeSchema: z.ZodType<InlineNode> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({
      type: z.literal('text'),
      text: z.string(),
      format: z.number().int().nonnegative(),
    }),
    z.object({ type: z.literal('linebreak') }),
    z.object({
      type: z.literal('link'),
      href: LinkHrefSchema,
      children: z.array(InlineNodeSchema),
    }),
    z.object({
      type: z.literal('internalLink'),
      slug: z.string().min(1),
      href: WebUrlSchema,
      children: z.array(InlineNodeSchema),
    }),
    UnsupportedNodeSchema,
  ]),
)

const InlineChildren = z.array(InlineNodeSchema)

export const ListNodeSchema: z.ZodType<ListNode> = z.lazy(() =>
  z.object({
    type: z.literal('list'),
    listType: z.enum(['bullet', 'number', 'check']),
    start: z.number().int(),
    children: z.array(
      z.object({
        type: z.literal('listitem'),
        checked: z.boolean().nullable(),
        children: z.array(z.union([InlineNodeSchema, ListNodeSchema])),
      }),
    ),
  }),
)

export const BodyNodeSchema: z.ZodType<BodyNode> = z.lazy(() =>
  z.union([
    z.object({ type: z.literal('paragraph'), children: InlineChildren }),
    z.object({
      type: z.literal('heading'),
      tag: z.enum(HEADING_TAGS),
      children: InlineChildren,
    }),
    z.object({ type: z.literal('quote'), children: InlineChildren }),
    ListNodeSchema,
    z.object({ type: z.literal('horizontalrule') }),
    z.object({ type: z.literal('upload'), media: MediaSchema }),
    z.object({ type: z.literal('block'), fields: BlockFieldsSchema }),
    UnsupportedNodeSchema,
  ]),
)

const Nodes = z.array(BodyNodeSchema)
const text = z.string()
const optionalText = z.string().nullable()

export const BlockFieldsSchema: z.ZodType<BlockFields> = z.lazy(() =>
  z.discriminatedUnion('blockType', [
    z.object({
      blockType: z.literal('accordion'),
      heading: optionalText,
      items: z.array(
        z.object({ title: text, defaultOpen: z.boolean(), content: Nodes }),
      ),
    }),
    z.object({
      blockType: z.literal('pullQuote'),
      quote: text,
      attribution: optionalText,
      sourceHref: HttpsUrlSchema.nullable(),
      variant: z.enum(['centered', 'bordered', 'large']),
    }),
    z.object({
      blockType: z.literal('signup'),
      heading: text,
      body: optionalText,
      href: WebUrlSchema,
    }),
    z.object({
      blockType: z.literal('callout'),
      emoji: optionalText,
      tone: z.enum(['accent', 'neutral', 'dark']),
      content: Nodes,
    }),
    z.object({
      blockType: z.literal('button'),
      label: text,
      href: LinkHrefSchema,
      variant: z.enum(['primary', 'secondary']),
      align: z.enum(['left', 'center']),
    }),
    z.object({
      blockType: z.literal('gallery'),
      layout: z.enum(['grid', 'rows']),
      caption: optionalText,
      items: z.array(z.object({ media: MediaSchema, caption: optionalText })),
    }),
    z.object({
      blockType: z.literal('bookmark'),
      href: HttpsUrlSchema,
      title: text,
      description: optionalText,
      publisher: optionalText,
      image: MediaSchema.nullable(),
    }),
    z.object({
      blockType: z.literal('embed'),
      href: HttpsUrlSchema,
      title: text,
      provider: z.enum(['youtube', 'vimeo']).nullable(),
    }),
    z.object({ blockType: z.literal('paywall') }),
    z.object({
      blockType: z.literal('keyTakeaways'),
      heading: text,
      items: z.array(text),
    }),
    z.object({
      blockType: z.literal('faq'),
      heading: text,
      items: z.array(z.object({ question: text, answer: Nodes })),
    }),
    z.object({
      blockType: z.literal('featureList'),
      heading: optionalText,
      intro: optionalText,
      variant: z.enum(['list', 'steps']),
      numbered: z.boolean(),
      items: z.array(
        z.object({
          title: text,
          body: optionalText,
          image: MediaSchema.nullable(),
        }),
      ),
    }),
    z.object({
      blockType: z.literal('mediaText'),
      media: MediaSchema.nullable(),
      heading: optionalText,
      body: Nodes,
      imageSide: z.enum(['left', 'right']),
    }),
    z.object({
      blockType: z.literal('comparisonTable'),
      caption: text,
      rowHeader: optionalText,
      columns: z.array(text),
      rows: z.array(
        z.object({ label: InlineChildren, cells: z.array(InlineChildren) }),
      ),
    }),
    z.object({
      blockType: z.literal('keyFacts'),
      heading: optionalText,
      items: z.array(z.object({ label: text, value: text })),
    }),
  ]),
)

const INLINE_TYPES = new Set(['text', 'linebreak', 'link', 'internalLink'])
const NODE_TYPES = new Set([
  ...INLINE_TYPES,
  'paragraph',
  'heading',
  'quote',
  'list',
  'listitem',
  'horizontalrule',
  'upload',
  'block',
  'unsupported',
])
const BLOCK_TYPE_SET = new Set<string>(BLOCK_TYPES)

/**
 * A body with every node of a type this contract does not know replaced by an
 * `unsupported` marker, so it can be validated and rendered around.
 *
 * A server newer than its client may send a node type the client predates.
 * Validating that body as it stands would reject the whole article for one
 * node, so a client runs this first. A *known* type with the wrong shape is
 * left alone and fails validation — that is a broken server, not a newer one.
 */
export function markUnsupported(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(markUnsupported)
  if (!value || typeof value !== 'object') return value

  const node = value as Record<string, unknown>
  if (typeof node.type === 'string') {
    if (!NODE_TYPES.has(node.type)) {
      return { type: 'unsupported', nodeType: node.type, blockType: null }
    }
    if (node.type === 'block') {
      const fields = node.fields as Record<string, unknown> | null | undefined
      const blockType = fields?.blockType
      if (typeof blockType !== 'string' || !BLOCK_TYPE_SET.has(blockType)) {
        return {
          type: 'unsupported',
          nodeType: 'block',
          blockType: typeof blockType === 'string' ? blockType : null,
        }
      }
    }
  }

  return Object.fromEntries(
    Object.entries(node).map(([key, child]) => [key, markUnsupported(child)]),
  )
}

/**
 * What an article body is: rich text written in the CMS, preserved Ghost HTML
 * (most migrated posts), or nothing worth rendering.
 *
 * The HTML is the markup the website serves, title heading and teaser cut
 * already applied. It is not sanitised for a browser; a client renders it
 * through its own allow-list and never as a web page.
 */
export const BodySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('lexical'), nodes: Nodes }),
  z.object({ kind: z.literal('html'), html: z.string() }),
  z.object({ kind: z.literal('empty') }),
])
export type Body = z.infer<typeof BodySchema>

// --- Documents ------------------------------------------------------------

export const TagRefSchema = z.object({ name: z.string(), slug: z.string() })
export type TagRef = z.infer<typeof TagRefSchema>

export const AuthorRefSchema = z.object({
  name: z.string(),
  slug: z.string().nullable(),
})
export type AuthorRef = z.infer<typeof AuthorRefSchema>

/** A post as a listing shows it. */
export const PostSummarySchema = z.object({
  slug: z.string(),
  title: z.string(),
  excerpt: z.string(),
  /** The article's canonical URL on the website. */
  href: WebUrlSchema,
  publishedAt: IsoDateSchema.nullable(),
  featured: z.boolean(),
  readingTime: z.number().int().nonnegative(),
  visibility: VisibilitySchema,
  authors: z.array(AuthorRefSchema),
  tags: z.array(TagRefSchema),
  image: MediaSchema.nullable(),
})
export type PostSummary = z.infer<typeof PostSummarySchema>

export const AuthorSchema = z.object({
  name: z.string(),
  slug: z.string().nullable(),
  bio: z.string().nullable(),
  image: MediaSchema.nullable(),
})
export type Author = z.infer<typeof AuthorSchema>

/**
 * A post as the reader shows it.
 *
 * `restricted` is true for a members-only or subscriber-only post: `body` is
 * then the website's teaser, and the rest of the piece is not in the response
 * at all.
 */
export const PostDetailSchema = PostSummarySchema.omit({
  authors: true,
}).extend({
  updatedAt: IsoDateSchema.nullable(),
  authors: z.array(AuthorSchema),
  restricted: z.boolean(),
  body: BodySchema,
})
export type PostDetail = z.infer<typeof PostDetailSchema>

// --- Responses ------------------------------------------------------------

export const PostListResponseSchema = z.object({
  posts: z.array(PostSummarySchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive().max(MAX_PAGE_SIZE),
  totalPages: z.number().int().positive(),
  totalPosts: z.number().int().nonnegative(),
})
export type PostListResponse = z.infer<typeof PostListResponseSchema>

export const PostResponseSchema = z.object({ post: PostDetailSchema })
export type PostResponse = z.infer<typeof PostResponseSchema>

export const TopicSchema = z.object({
  name: z.string(),
  slug: z.string(),
  postCount: z.number().int().nonnegative(),
})
export type Topic = z.infer<typeof TopicSchema>

export const TagListResponseSchema = z.object({ tags: z.array(TopicSchema) })
export type TagListResponse = z.infer<typeof TagListResponseSchema>

export const TagResponseSchema = z.object({
  tag: z.object({
    name: z.string(),
    slug: z.string(),
    description: z.string().nullable(),
    image: MediaSchema.nullable(),
  }),
  posts: z.array(PostSummarySchema),
})
export type TagResponse = z.infer<typeof TagResponseSchema>

export const AuthorListResponseSchema = z.object({
  authors: z.array(
    AuthorSchema.extend({ postCount: z.number().int().nonnegative() }),
  ),
})
export type AuthorListResponse = z.infer<typeof AuthorListResponseSchema>

export const AuthorResponseSchema = z.object({
  author: AuthorSchema,
  posts: z.array(PostSummarySchema),
})
export type AuthorResponse = z.infer<typeof AuthorResponseSchema>

export const SearchResponseSchema = z.object({
  /** The term as the server searched for it: trimmed, collapsed, truncated. */
  query: z.string().max(MAX_SEARCH_LENGTH),
  posts: z.array(PostSummarySchema),
})
export type SearchResponse = z.infer<typeof SearchResponseSchema>

/** What every error status answers with. */
export const ErrorResponseSchema = z.object({ error: z.string() })
