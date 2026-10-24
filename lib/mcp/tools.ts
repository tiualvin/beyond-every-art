// Custom MCP tools for drafting, illustrating, and looking back.
//
// The plugin's generated CRUD tools are enough to read and edit documents, but
// not to write one: they expose `content` as raw Lexical editor state (see
// `markdown.ts`). Nor can they carry a file, so an image has no way in at all. These tools close both gaps, so an agent's
// job is to write and illustrate the article rather than to satisfy the schema.
// Nor do they reach version history, which Payload keeps for every save; the
// version tools read it, and `restoreArticleVersion` reverts to it — as a
// draft, and never touching what decides where and to whom a post is served.
// Nor can they edit a migrated article, whose page renders from its Ghost HTML;
// `readLegacyHtml` and `editLegacyHtml` change that HTML a phrase at a time.
//
// `@payloadcms/plugin-mcp` still has no `defineTool` helper at `3.88.0`, the
// release this project pins — it is documented on Payload's main branch but has
// not shipped — so tools are declared as plain objects against the `mcp.tools`
// config type. Re-check on the next version bump: adopting the helpers is a
// refactor of this file, not a config change.

import type { MCPPluginConfig } from '@payloadcms/plugin-mcp'
import type { PayloadRequest, TypedUser, Where } from 'payload'
import { z } from 'zod'

import { FAQ_BLOCK, KEY_FACTS_MAX_ITEMS } from '../../blocks/schema'
import { toArticleBody } from '../content/body'
import { findUnpublishedWork } from '../content/editorial-status'
import { isScheduled, SCHEDULE_GRANULARITY_SECONDS } from '../content/schedule'
import { htmlToPlainText, richTextToPlainText } from '../content/plain-text'
import { buildPreviewUrl } from '../preview/live-preview'
import { absoluteUrl, getSiteUrl, postPath } from '../seo/site'
import {
  listBlocks,
  markBlocks,
  refuseLiteralComments,
  restoreBlocks,
} from './blocks'
import { compareAnchors, markAnchors, restoreAnchors } from './anchors'
import { setFaq, type FaqInputItem } from './faq'
import { setKeyFacts, type Fact } from './key-facts'
import { withChildren } from './placement'
import { setTable, TABLE_MAX_COLUMNS, TABLE_MAX_ROWS } from './table'
import {
  planLegacyConversion,
  saveLegacyConversion,
  type LegacyArticle,
} from './convert-legacy'
import {
  findInLegacyHtml,
  MAX_MATCHES,
  pageOfLegacyHtml,
  planLegacyEdits,
  type AddedLink,
  type LegacyEdit,
} from './legacy-html'
import {
  blockFieldsForReading,
  lexicalToMarkdown,
  markdownToBlockRichText,
  markdownToLexical,
  type EditorState,
  type MarkdownCollection,
} from './markdown'
import { decodeImageUpload, vetImageBytes } from './upload'
import { mayPublishThrough } from './publish-guard'
import { MAX_AGENT_UPLOAD_BYTES } from '../security/uploads'
import {
  fetchPublicBytes,
  OutboundFetchError,
} from '../security/outbound-fetch'

type McpTool = NonNullable<NonNullable<MCPPluginConfig['mcp']>['tools']>[number]

type ToolResult = { content: Array<{ text: string; type: 'text' }> }

const text = (value: unknown): ToolResult => ({
  content: [
    {
      text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
      type: 'text',
    },
  ],
})

/** Resolves slugs to document ids, refusing rather than silently dropping. */
async function idsForSlugs(
  req: PayloadRequest,
  collection: 'authors' | 'tags',
  slugs: string[] | undefined,
): Promise<(number | string)[] | undefined> {
  if (!slugs?.length) return undefined

  const { docs } = await req.payload.find({
    collection,
    limit: slugs.length,
    overrideAccess: false,
    pagination: false,
    req,
    user: req.user,
    where: { slug: { in: slugs } },
  })

  // Read the slug through `unknown`. `payload-types.ts` is generated and
  // gitignored, so a clean checkout — the Docker build, and CI before anything
  // boots Payload — types these documents as `JsonObject & TypeWithID`, which a
  // direct cast to `{ slug: string }` does not overlap with. Nothing else in
  // this repository imports the generated types, and this must not either.
  const found = new Map(
    docs.map((doc) => [
      String((doc as unknown as { slug?: unknown }).slug),
      doc.id,
    ]),
  )
  const missing = slugs.filter((slug) => !found.has(slug))
  if (missing.length) {
    throw new Error(
      `Unknown ${collection}: ${missing.join(', ')}. Create them first, or omit them.`,
    )
  }

  return slugs.map((slug) => found.get(slug)!)
}

// Deliberately posts-only. `pages` is not in the plugin's collection allowlist,
// and a custom tool that reached it anyway would make that allowlist understate
// the real surface. Adding pages is a Phase 3 decision, taken in both places.
const COLLECTION = 'posts' satisfies MarkdownCollection

/**
 * The article's draft, with relationships left as ids.
 *
 * Depth 0 is what makes an inline image survive a read and a revision. Left at
 * Payload's default depth, the image's upload is populated, and the Markdown
 * converter writes a populated image as `![alt](url)` — which is not a form it
 * reads back: the revision stored that line as literal text, so the picture
 * vanished and its Markdown source printed on the page instead. Unpopulated, it
 * writes `![media:7]()`, which it does read back, as the same upload.
 *
 * It is also the only honest thing for a tool that writes the body back to
 * start from: what it saves is then exactly what it read.
 */
async function findArticle(
  req: PayloadRequest,
  collection: MarkdownCollection,
  args: { id?: string; slug?: string },
) {
  if (args.id) {
    return req.payload.findByID({
      collection,
      id: args.id,
      depth: 0,
      draft: true,
      overrideAccess: false,
      req,
      user: req.user as TypedUser,
    })
  }

  if (!args.slug) throw new Error('Provide either `id` or `slug`.')

  const { docs } = await req.payload.find({
    collection,
    depth: 0,
    draft: true,
    limit: 1,
    overrideAccess: false,
    req,
    user: req.user,
    where: { slug: { equals: args.slug } },
  })

  const doc = docs[0]
  if (!doc)
    throw new Error(`No ${collection} document with slug \`${args.slug}\`.`)
  return doc
}

/**
 * Whether the page renders this article from its migrated Ghost HTML.
 *
 * Asked of the renderer rather than decided here. `legacyHTML` being set is not
 * the question: the rich-text body wins whenever it holds anything, so a
 * migrated article that has since been rewritten in the editor renders from
 * `content` — and a check on `legacyHTML` alone told the agent its edits would
 * not reach the page when they were the only thing that would.
 */
function rendersFromLegacyHTML(doc: Record<string, unknown>): boolean {
  return (
    toArticleBody(
      {
        content: doc.content,
        legacyHTML: doc.legacyHTML as string | null | undefined,
        title: doc.title as string | null | undefined,
      },
      { preview: true },
    ).kind === 'html'
  )
}

/**
 * Refuses to give a body to an article that renders from its Ghost HTML.
 *
 * The rich-text body wins over the HTML whenever it holds anything, so a body
 * holding only one module would replace the whole migrated article on the page
 * with that module. `what` names the module in the refusal.
 */
function refuseLegacyBody(doc: Record<string, unknown>, what: string): void {
  if (!rendersFromLegacyHTML(doc)) return
  throw new Error(
    'This article renders from migrated Ghost HTML (`legacyHTML`), and ' +
      `its rich-text body is empty. Adding ${what} would make the page ` +
      `render the rich-text body — ${what} alone — in place of the ` +
      'article. Move its body into the editor first.',
  )
}

/**
 * Refuses an article whose page does not render from its Ghost HTML.
 *
 * The HTML tools read and change `legacyHTML`, which only reaches readers
 * while the rich-text body is empty. Once an editor has written there, the
 * HTML is left behind in the field and an edit to it changes nothing anyone
 * sees — so the caller is pointed at the tool that does.
 */
function refuseUnlessLegacy(doc: Record<string, unknown>, instead: string) {
  if (rendersFromLegacyHTML(doc)) return
  throw new Error(
    typeof doc.legacyHTML === 'string' && doc.legacyHTML
      ? 'This article renders from its rich-text body, which has replaced its ' +
          'migrated Ghost HTML (`legacyHTML`) on the page, so that HTML is not ' +
          `what readers see. Use \`${instead}\`.`
      : 'This article has no migrated Ghost HTML (`legacyHTML`); it renders ' +
          `from its rich-text body. Use \`${instead}\`.`,
  )
}

/**
 * Refuses a write to a field the key's user may not write, before it is tried.
 *
 * Asked of the field's own access rule rather than restated here, so the tool
 * follows the collection if the rule changes. Asking matters because Payload
 * does not refuse such a write: under `overrideAccess: false` it keeps the
 * stored value and says nothing, so an author's edit to `legacyHTML` would save
 * a new draft identical to the last and report success.
 */
async function refuseUnlessWritable(
  req: PayloadRequest,
  doc: Record<string, unknown>,
  name: string,
  refusal?: string,
) {
  const field = req.payload.collections[
    COLLECTION
  ]?.config.flattenedFields.find(
    (candidate) => 'name' in candidate && candidate.name === name,
  )
  // Fail closed: a field this cannot find is a field it cannot vouch for.
  if (!field) throw new Error(`Posts has no \`${name}\` field to write.`)
  const rule = field.access?.update
  if (!rule) return
  const allowed = await rule({
    data: doc,
    doc: doc as never,
    id: doc.id as number | string,
    req,
    siblingData: doc,
  })
  if (!allowed) {
    if (refusal) throw new Error(refusal)
    throw new Error(
      `\`${name}\` can be written only by an editor or an administrator — it ` +
        'is markup the public site runs as it stands — and this key belongs to ' +
        'someone who may not write it. Ask an editor to make the change.',
    )
  }
}

const targetShape = {
  id: z.string().optional().describe('Document id. Provide this or `slug`.'),
  slug: z.string().optional().describe('Document slug. Provide this or `id`.'),
}

/**
 * What `readArticleMarkdown` says about a document, and `readArticleVersion`
 * about a revision of one.
 *
 * One function for both, so that a version reads back in exactly the format
 * the current draft does and the two can be compared line for line. Two copies
 * of this would drift the first time either was touched, and the drift would
 * show up as a spurious difference in somebody's merge.
 */
function articleView(req: PayloadRequest, doc: Record<string, unknown>) {
  const content = doc.content as EditorState | null | undefined

  return {
    // Beside the Markdown rather than in it, so reviewing a draft shows what
    // each module says as well as where it is. Rich text inside a module — an
    // FAQ answer, a callout — reads as Markdown, like the body around it.
    blocks: listBlocks(content, (fields) =>
      blockFieldsForReading(req.payload, COLLECTION, fields),
    ),
    excerpt: doc.excerpt ?? null,
    // Migrated bodies live in `legacyHTML` and are not Lexical; say so
    // rather than returning an empty string that reads like an empty post.
    // This used to add that a Markdown edit "would not change the published
    // page", which was backwards: a rich-text body wins over the HTML, so it
    // would replace the whole article.
    markdown: rendersFromLegacyHTML(doc)
      ? '(This document renders from migrated Ghost HTML (`legacyHTML`), not from the ' +
        'rich-text body. Read the HTML with `readLegacyHtml` and change it with ' +
        '`editLegacyHtml`. A Markdown body saved with `updateArticleMarkdown` would ' +
        'not edit this article: it would replace the whole of it.)'
      : lexicalToMarkdown(
          req.payload,
          COLLECTION,
          // Kept heading anchors as `{#anchor}` suffixes, so a revision can
          // carry them back; see `anchors.ts`.
          content && markBlocks(markAnchors(content)),
        ),
    slug: doc.slug,
    status: doc._status ?? null,
    title: doc.title,
  }
}

/**
 * How many versions `listArticleVersions` may return at once.
 *
 * `maxPerDoc` on Posts, which is every version a post keeps — so the ceiling
 * never hides history that exists. `tests/mcp/tools.test.ts` holds the two
 * numbers together.
 */
const MAX_VERSIONS = 50

/** Enough of a body to tell neighbouring revisions apart, and no more. */
const SNIPPET_CHARS = 100

/** The opening words of a revision's body, whichever way it is stored. */
function snippet(doc: Record<string, unknown>): string {
  const words = (
    typeof doc.legacyHTML === 'string' && doc.legacyHTML
      ? htmlToPlainText(doc.legacyHTML)
      : richTextToPlainText(doc.content)
  )
    .replace(/\s+/g, ' ')
    .trim()

  return words.length > SNIPPET_CHARS
    ? `${words.slice(0, SNIPPET_CHARS).trimEnd()}…`
    : words
}

/**
 * What `restoreArticleVersion` puts back, by scope. An allowlist, so a field
 * added to Posts later is left alone until someone decides otherwise —
 * `tests/mcp/tools.test.ts` fails until every field is in this or in
 * `KEPT_ON_RESTORE`.
 */
export const RESTORED_FIELDS = {
  body: ['content', 'legacyHTML'],
  article: [
    'content',
    'legacyHTML',
    'title',
    'excerpt',
    'featuredImage',
    'metaTitle',
    'metaDescription',
    'authors',
    'tags',
  ],
} as const satisfies Record<string, readonly string[]>

/**
 * Never reverted, whatever the scope: what decides where, when, and to whom a
 * post is served, and who may edit it. Each would change something a reader, a
 * crawler, or a member sees the next time a person presses publish — without
 * anything on the edit screen saying it had moved — and none of them is what
 * "go back to Tuesday's version of this article" means.
 *
 * - `slug` is the URL. An older one would move a live address on publish.
 * - `visibility` is the paywall. An older one could gate a free article, or
 *   hand a paid one to everybody.
 * - `canonicalURL` and `noindex` are what search engines are told.
 * - `featured` places the article on the homepage.
 * - `publishedAt` is the date readers and feeds see; `stampPublishedAt` owns it.
 * - `owners` is who may edit; `lastEditedBy` is stamped by the write itself.
 * - `reviewState` is where the draft stands in review now, not then.
 * - the `ghost*` and `migrationStatus` fields are the Ghost import's identity
 *   and bookkeeping, which a rerun matches on.
 */
export const KEPT_ON_RESTORE = [
  'slug',
  'visibility',
  'canonicalURL',
  'noindex',
  'featured',
  'publishedAt',
  'owners',
  'lastEditedBy',
  'reviewState',
  'ghostID',
  'ghostUpdatedAt',
  'ghostURL',
  'migrationStatus',
] as const

type RestoreScope = keyof typeof RESTORED_FIELDS

/** Whether two stored values differ, as stored. */
const differs = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)

/** A version's parent id, whether or not the relationship was populated. */
function parentID(parent: unknown): unknown {
  return typeof parent === 'object' && parent !== null
    ? (parent as { id?: unknown }).id
    : parent
}

/** Where a post stands with readers: what its live row says, now. */
type LiveState = 'live' | 'scheduled' | 'unpublished'

/**
 * The live row — what the site serves — as opposed to the newest version.
 *
 * `findArticle` reads the newest version, which is the right thing to revise
 * and the wrong thing to ask "is this on the site?" of: a draft saved over a
 * live article reads as a draft there. Read with the caller's own access.
 */
async function readLiveRow(
  req: PayloadRequest,
  id: number | string,
  now: Date = new Date(),
) {
  return readLiveRowWhere(req, { id: { equals: id } }, now)
}

/** The same, for whichever post `where` names — a slug, for a link's target. */
async function readLiveRowWhere(
  req: PayloadRequest,
  where: Where,
  now: Date = new Date(),
): Promise<{
  state: LiveState
  publishedAt: string | null
  doc: Record<string, unknown> | null
}> {
  const { docs } = await req.payload.find({
    collection: COLLECTION,
    depth: 0,
    draft: false,
    limit: 1,
    overrideAccess: false,
    req,
    user: req.user,
    where,
  })
  const doc = (docs[0] as unknown as Record<string, unknown>) ?? null
  if (!doc || doc._status !== 'published') {
    return { state: 'unpublished', publishedAt: null, doc }
  }
  const publishedAt =
    typeof doc.publishedAt === 'string' && doc.publishedAt
      ? doc.publishedAt
      : null
  return {
    state: isScheduled('published', publishedAt, now) ? 'scheduled' : 'live',
    publishedAt,
    doc,
  }
}

/**
 * What the caller of a draft-only write needs to know about readers.
 *
 * These tools answered every write with `status: 'draft'`, which is true of the
 * newest version and says nothing about the page. On a live article it means
 * readers do not get the change — and on 7 Oct 2026 an agent took that answer
 * as the end of the job twenty times over, leaving live articles with
 * revisions nobody published. So the reply now says what readers see, and,
 * where it matters, what would get the change to them.
 */
async function whatReadersSee(
  req: PayloadRequest,
  id: number | string,
): Promise<{ readers: LiveState; note?: string }> {
  const live = await readLiveRow(req, id)
  if (live.state === 'live') {
    return {
      readers: 'live',
      note:
        'Saved as a draft over a live article: readers still see the ' +
        'published version. The change reaches them when it is published ' +
        'again — `publishArticle`, which needs an administrator key or a ' +
        'connector granted publishing, or Publish in the admin panel.',
    }
  }
  if (live.state === 'scheduled') {
    return {
      readers: 'scheduled',
      note:
        `Saved as a draft over an article scheduled for ${live.publishedAt}. ` +
        'It goes out then as last published, without this change, unless ' +
        'it is published again before then; `publishArticle` keeps its slot.',
    }
  }
  return { readers: 'unpublished' }
}

/** What a link added to a migrated article leads to, as a reader would find it. */
type LinkReport =
  | { edit: number; href: string; target: 'external' }
  | {
      edit: number
      href: string
      target: 'article'
      slug: string
      status: 'live' | 'scheduled'
      title: unknown
      publishedAt: string | null
    }

/**
 * Checks every link an edit adds to this site against the article it names.
 *
 * A link to an article that is not on the site answers 404 to every reader who
 * follows it, so it is refused — whether no article has that slug or one does
 * and has never been published. A scheduled article is allowed, with a
 * warning, because it will be there; until then it 404s too. Anything on this
 * site that is not an article's address is refused, because this tool cannot
 * check it: `pages` is outside the plugin's allowlist (see `COLLECTION`), and
 * an unchecked internal link is exactly what this is here to prevent.
 */
async function checkAddedLinks(
  req: PayloadRequest,
  added: AddedLink[],
): Promise<{ links: LinkReport[]; warnings: string[] }> {
  const now = new Date()
  const links: LinkReport[] = []
  const warnings: string[] = []
  const problems: string[] = []

  for (const link of added) {
    if (link.target === 'external') {
      links.push({ edit: link.edit, href: link.href, target: 'external' })
      continue
    }
    if (!link.slug) {
      problems.push(
        `Edit ${link.edit}: links to ${link.path}, which is not an article's ` +
          'address. This tool links only to articles, which it can check; add ' +
          'a link to a page, a tag or anything else in the admin panel.',
      )
      continue
    }

    const row = await readLiveRowWhere(
      req,
      { slug: { equals: link.slug } },
      now,
    )
    if (row.state === 'unpublished') {
      problems.push(
        row.doc
          ? `Edit ${link.edit}: links to ${link.path}, an article that has ` +
              'never been published — the link would answer 404 until it is.'
          : `Edit ${link.edit}: links to ${link.path}, and no article has the ` +
              `slug \`${link.slug}\` (status: not found).`,
      )
      continue
    }

    links.push({
      edit: link.edit,
      href: link.href,
      target: 'article',
      slug: link.slug,
      status: row.state,
      title: row.doc?.title ?? null,
      publishedAt: row.publishedAt,
    })
    if (row.state === 'scheduled') {
      warnings.push(
        `Edit ${link.edit}: ${link.path} is scheduled for ${row.publishedAt}. ` +
          'Until then the link answers 404 to readers, so do not publish this ' +
          'change before it.',
      )
    }
    if (!link.path.endsWith('/')) {
      warnings.push(
        `Edit ${link.edit}: ${link.href} has no trailing slash, and the site ` +
          `redirects it to ${postPath(link.slug)}. Link to that instead.`,
      )
    }
  }

  if (problems.length) throw new Error(problems.join('\n'))
  return { links, warnings }
}

/** How much of the stored HTML `readLegacyHtml` returns at once, by default and at most. */
const LEGACY_PAGE = 8000
const LEGACY_PAGE_MAX = 20000

/** Stored HTML either side of a match, by default and at most. */
const LEGACY_CONTEXT = 300
const LEGACY_CONTEXT_MAX = 2000

/** Edits in one call, and the longest `find` or `replace`. */
const LEGACY_EDITS_MAX = 20
const LEGACY_EDIT_CHARS = 5000

/** Payload's own bookkeeping, never sent back in a write. */
const SYSTEM_FIELDS = new Set([
  'id',
  'createdAt',
  'updatedAt',
  'deletedAt',
  '_status',
])

/** Written by the save itself; never a change a reader would see. */
const NOT_READER_FACING = new Set(['_status', 'lastEditedBy'])

/**
 * What publishing may not change on an article that is already live.
 *
 * The address, and where search engines are told the original lives. Either
 * changes something crawlers have cached, which `AGENTS.md` keeps for a person
 * to decide — and a slug change also needs a redirect, which only the admin
 * panel can add.
 */
const FIXED_WHILE_LIVE = ['slug', 'canonicalURL'] as const

/** An ISO 8601 time that names its offset, so "20:00" cannot mean two things. */
const ZONED_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i

/**
 * `publishAt` as a time, or undefined when the call left it out.
 *
 * Only "now" or a moment ahead. A date in the past would put an article out
 * backdated — filed below newer work in every listing and the feed — which is
 * an editorial decision about history, made in the admin panel.
 */
export function resolvePublishAt(
  value: string | undefined,
  now: Date = new Date(),
): string | undefined {
  if (value === undefined) return undefined
  const trimmed = value.trim()
  if (trimmed.toLowerCase() === 'now') return now.toISOString()
  if (!ZONED_TIME.test(trimmed)) {
    throw new Error(
      '`publishAt` must be "now" or an ISO 8601 time with its offset, such ' +
        'as 2026-11-04T20:00:00Z.',
    )
  }
  const at = Date.parse(trimmed)
  if (!Number.isFinite(at))
    throw new Error(`\`publishAt\` is not a time: ${value}`)
  if (at <= now.getTime()) {
    throw new Error(
      `\`publishAt\` (${trimmed}) has passed. Pass "now" to publish today, or ` +
        'a time ahead to schedule. Backdating is done in the admin panel.',
    )
  }
  return new Date(at).toISOString()
}

export const mcpTools: McpTool[] = [
  {
    description:
      'Create a new article as a draft, with its body written in Markdown. ' +
      'The body is converted to the editor format server-side. Never publishes: ' +
      'the result is always a draft for a person to review and publish.',
    handler: async (args: Record<string, unknown>, req: PayloadRequest) => {
      const {
        authorSlugs,
        excerpt,
        markdown,
        metaDescription,
        metaTitle,
        slug,
        tagSlugs,
        title,
      } = args as {
        authorSlugs?: string[]
        excerpt?: string
        markdown: string
        metaDescription?: string
        metaTitle?: string
        slug: string
        tagSlugs?: string[]
        title: string
      }

      const [authors, tags] = await Promise.all([
        idsForSlugs(req, 'authors', authorSlugs),
        idsForSlugs(req, 'tags', tagSlugs),
      ])

      const content = restoreAnchors(
        markdownToLexical(req.payload, 'posts', markdown),
      )
      refuseLiteralComments(content)

      const created = await req.payload.create({
        collection: 'posts',
        data: {
          _status: 'draft',
          content,
          excerpt,
          metaDescription,
          metaTitle,
          slug,
          title,
          visibility: 'public',
          ...(authors ? { authors: authors as number[] } : {}),
          ...(tags ? { tags: tags as number[] } : {}),
        },
        draft: true,
        overrideAccess: false,
        req,
        user: req.user as TypedUser,
      })

      return text({
        id: created.id,
        preview: buildPreviewUrl({ collection: 'posts', slug: created.slug }),
        slug: created.slug,
        status: 'draft',
        title: created.title,
      })
    },
    name: 'draftArticle',
    parameters: {
      authorSlugs: z
        .array(z.string())
        .optional()
        .describe('Public byline author slugs. Must already exist.'),
      excerpt: z.string().optional().describe('Short summary for listings.'),
      markdown: z.string().describe('The article body, in Markdown.'),
      metaDescription: z.string().optional().describe('SEO description.'),
      metaTitle: z.string().optional().describe('SEO title, if different.'),
      slug: z
        .string()
        .describe('URL slug. Must be unique and not a reserved root path.'),
      tagSlugs: z
        .array(z.string())
        .optional()
        .describe('Tag slugs. Must already exist.'),
      title: z.string().describe('Article title.'),
    },
  },
  {
    description:
      'Read an article back as Markdown, including its draft body. ' +
      'Use this before revising, so edits are made against the current text. ' +
      'Modules inserted into the body (key facts, FAQs, galleries, callouts) ' +
      'have no Markdown form: each appears as a line like ' +
      '`<!-- block:keyFacts:<key> -->` where it sits, and its contents are ' +
      'listed in `blocks`. A heading that keeps an anchor from the migrated ' +
      'article ends with `{#anchor}`: the address search engines link to ' +
      'that section.',
    handler: async (args: Record<string, unknown>, req: PayloadRequest) => {
      const target = args as { id?: string; slug?: string }

      const doc = (await findArticle(
        req,
        COLLECTION,
        target,
      )) as unknown as Record<string, unknown>

      return text({ ...articleView(req, doc), id: doc.id })
    },
    name: 'readArticleMarkdown',
    parameters: targetShape,
  },
  {
    description:
      "Read a migrated article's Ghost HTML (`legacyHTML`) — the body its page " +
      'renders from — exactly as stored, to copy strings for `editLegacyHtml`. ' +
      'With `query`, finds text as a reader sees it (references decoded, curly ' +
      'quotes and dashes matched by straight ones, case and spacing ignored, ' +
      'across inline tags) and returns each match as the exact stored HTML it ' +
      'spans, with `before` and `after` context, its occurrence number, the ' +
      'heading it sits under, and `storedOccurrences`: 1 means `html` can be ' +
      'used as `find` as it is, more means widen it with characters from ' +
      '`before` or `after`. Without `query`, returns a page of the stored HTML ' +
      'and its total length; continue from `nextOffset`. Read-only. Refused ' +
      'for an article that renders from its rich-text body — use ' +
      '`readArticleMarkdown` for that.',
    handler: async (args: Record<string, unknown>, req: PayloadRequest) => {
      const {
        context = LEGACY_CONTEXT,
        limit = LEGACY_PAGE,
        offset = 0,
        query,
        ...target
      } = args as {
        context?: number
        id?: string
        limit?: number
        offset?: number
        query?: string
        slug?: string
      }

      // The same resolution `readArticleMarkdown` uses: the newest version,
      // under the key's own access, at depth 0.
      const doc = (await findArticle(
        req,
        COLLECTION,
        target,
      )) as unknown as Record<string, unknown>
      refuseUnlessLegacy(doc, 'readArticleMarkdown')

      const html = doc.legacyHTML as string
      const described = {
        id: doc.id,
        slug: doc.slug,
        status: doc._status ?? null,
        title: doc.title,
        totalLength: html.length,
      }

      if (query !== undefined) {
        const { total, matches } = findInLegacyHtml(html, query, { context })
        return text({
          ...described,
          query,
          totalMatches: total,
          ...(total > matches.length
            ? {
                note: `Only the first ${MAX_MATCHES} matches are shown. Make the query longer to narrow it.`,
              }
            : {}),
          matches,
        })
      }

      return text({ ...described, ...pageOfLegacyHtml(html, offset, limit) })
    },
    name: 'readLegacyHtml',
    parameters: {
      ...targetShape,
      context: z
        .number()
        .int()
        .min(0)
        .max(LEGACY_CONTEXT_MAX)
        .optional()
        .describe(
          `With \`query\`: characters of stored HTML either side of each match. Defaults to ${LEGACY_CONTEXT}; at most ${LEGACY_CONTEXT_MAX}.`,
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(LEGACY_PAGE_MAX)
        .optional()
        .describe(
          `Without \`query\`: characters per page. Defaults to ${LEGACY_PAGE}; at most ${LEGACY_PAGE_MAX}. A page never ends inside a tag.`,
        ),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
          'Without `query`: where the page starts in the stored HTML. Defaults to 0; continue from the `nextOffset` of the page before.',
        ),
      query: z
        .string()
        .min(1)
        .max(500)
        .optional()
        .describe(
          'Text to find, as a reader sees it on the page, e.g. "Tyrian purple". Not HTML.',
        ),
    },
  },
  {
    description:
      "List an article's saved versions, newest first, without their bodies. " +
      'Each entry has a `versionId` for `readArticleVersion`, when it was ' +
      'saved, its title and status then, and the opening words of its body, so ' +
      'the right point in history can be found without reading every version. ' +
      'Autosave records a version at each pause in typing, so neighbouring ' +
      'entries often differ by a few words. `latest` marks the current draft. ' +
      'Read-only.',
    handler: async (args: Record<string, unknown>, req: PayloadRequest) => {
      const { limit = 20, ...target } = args as {
        id?: string
        limit?: number
        slug?: string
      }

      // The same resolution `readArticleMarkdown` uses, so a slug means the
      // same document here as there — and a document the key cannot read is
      // refused here, before any history is looked at.
      const doc = await findArticle(req, COLLECTION, target)

      const { docs, totalDocs } = await req.payload.findVersions({
        collection: COLLECTION,
        // Snippets need no populated relationships. At the default depth each
        // version would populate its authors, tags and images only to have
        // them thrown away.
        depth: 0,
        limit,
        overrideAccess: false,
        req,
        sort: '-updatedAt',
        user: req.user as TypedUser,
        where: { parent: { equals: doc.id } },
      })

      return text({
        id: doc.id,
        slug: doc.slug,
        totalVersions: totalDocs,
        versions: docs.map((entry) => {
          const version = entry.version as unknown as Record<string, unknown>
          return {
            autosave: (entry as { autosave?: unknown }).autosave === true,
            latest: entry.latest === true,
            snippet: snippet(version),
            status: version._status ?? null,
            title: version.title,
            updatedAt: entry.updatedAt,
            // A string, because that is what `readArticleVersion` takes.
            versionId: String(entry.id),
          }
        }),
      })
    },
    name: 'listArticleVersions',
    parameters: {
      ...targetShape,
      limit: z
        .number()
        .int()
        .min(1)
        .max(MAX_VERSIONS)
        .optional()
        .describe(
          `How many versions to list, newest first. Defaults to 20; at most ${MAX_VERSIONS}, which is every version a post keeps.`,
        ),
    },
  },
  {
    description:
      'Read one saved version of an article, from `listArticleVersions`, as ' +
      'Markdown — in exactly the format `readArticleMarkdown` returns the ' +
      'current draft, so the two can be compared. Returns the title, slug, ' +
      'excerpt and status as they were in that version. Read-only: it changes ' +
      'nothing. To bring back some of the old text while keeping what was ' +
      'added since, merge the parts you want into the current body and save ' +
      'it with `updateArticleMarkdown`. To revert wholesale, use ' +
      '`restoreArticleVersion`, which overwrites rather than merges.',
    handler: async (args: Record<string, unknown>, req: PayloadRequest) => {
      const { versionId } = args as { versionId: string }

      // Depth 0, as `findArticle` reads the live draft. An image in the body
      // converts to `![alt](url)` only when its upload is populated, and to a
      // bare `![media:id]()` placeholder when it is not — so reading a version
      // at any other depth would make the two outputs differ where the
      // article did not. (The placeholder is also the only form
      // `updateArticleMarkdown` reads back as an image.)
      const entry = await req.payload.findVersionByID({
        collection: COLLECTION,
        depth: 0,
        id: versionId,
        overrideAccess: false,
        req,
        user: req.user as TypedUser,
      })
      const version = entry.version as unknown as Record<string, unknown>

      return text({
        ...articleView(req, version),
        autosave: (entry as { autosave?: unknown }).autosave === true,
        id: parentID(entry.parent),
        latest: entry.latest === true,
        updatedAt: entry.updatedAt,
        versionId: String(entry.id),
      })
    },
    name: 'readArticleVersion',
    parameters: {
      versionId: z
        .string()
        .min(1)
        .describe('The `versionId` of an entry from `listArticleVersions`.'),
    },
  },
  {
    description:
      'Revert an article to a version from `listArticleVersions`. This ' +
      'OVERWRITES; it does not merge. Every field in `scope` is replaced ' +
      'wholesale with its value in that version, so anything added to those ' +
      'fields since — paragraphs, images, tags, authors — is gone from the ' +
      'draft. `scope: "body"` replaces only the body. `scope: "article"` also ' +
      'replaces the title, excerpt, featured image, SEO title and ' +
      'description, authors and tags. Never changed, whatever the scope: the ' +
      'slug, visibility, canonical URL, noindex, featured flag, publication ' +
      'date, owners, review state and Ghost migration fields. The body is ' +
      'copied as stored, so blocks and images come back exactly — unlike ' +
      'reading Markdown and writing it back. The result is always a draft: ' +
      'the published page does not change until a person publishes it from ' +
      'the admin panel. The draft it replaces stays in history, and the ' +
      'response gives its `undo` versionId, which reverts the revert. Pass ' +
      '`dryRun: true` first to see which fields would change. To keep newer ' +
      'material, do not use this: merge by hand with `readArticleVersion` and ' +
      '`updateArticleMarkdown`.',
    handler: async (args: Record<string, unknown>, req: PayloadRequest) => {
      const {
        dryRun = false,
        scope,
        versionId,
      } = args as { dryRun?: boolean; scope: RestoreScope; versionId: string }

      const fields: readonly string[] = RESTORED_FIELDS[scope]
      if (!fields) throw new Error('`scope` must be "body" or "article".')

      // Depth 0 on every read here: relationships, and the images inside a
      // body, come back as ids — the form a write takes, and the form two
      // values have to be in to be compared.
      const entry = await req.payload.findVersionByID({
        collection: COLLECTION,
        depth: 0,
        id: versionId,
        overrideAccess: false,
        req,
        user: req.user as TypedUser,
      })
      const version = entry.version as unknown as Record<string, unknown>
      const id = parentID(entry.parent) as number | string

      const current = (await req.payload.findByID({
        collection: COLLECTION,
        depth: 0,
        draft: true,
        id,
        overrideAccess: false,
        req,
        user: req.user as TypedUser,
      })) as unknown as Record<string, unknown>

      // A field the version has no value for at all is left as it is, rather
      // than cleared: absence in an old snapshot says nothing about intent.
      const data = Object.fromEntries(
        fields
          .filter((field) => version[field] !== undefined)
          .map((field) => [field, version[field]]),
      )

      const described = {
        id,
        kept: KEPT_ON_RESTORE,
        scope,
        slug: current.slug,
        versionId: String(entry.id),
        versionSavedAt: entry.updatedAt,
      }

      if (dryRun) {
        return text({
          ...described,
          changes: Object.keys(data).filter((field) =>
            differs(current[field], data[field]),
          ),
          dryRun: true,
        })
      }

      // The current draft is the newest version. Captured before the write so
      // the response can say how to undo it.
      const {
        docs: [replaced],
      } = await req.payload.findVersions({
        collection: COLLECTION,
        depth: 0,
        limit: 1,
        overrideAccess: false,
        req,
        sort: '-updatedAt',
        user: req.user as TypedUser,
        where: { parent: { equals: id } },
      })

      // An ordinary draft update rather than Payload's `restoreVersion`, which
      // does two things this tool must not. Without `draft` it writes the
      // snapshot over the live document, so restoring a draft over a published
      // post would unpublish it. And it hands its hooks the snapshot's own
      // `_status`, so reverting to a published version trips
      // `refuseMcpPublish` for every editor key, although nothing is being
      // published. This path runs the same access, publish guard, audit line
      // and authorship stamp as `updateArticleMarkdown`.
      const updated = (await req.payload.update({
        collection: COLLECTION,
        data: { ...data, _status: 'draft' },
        depth: 0,
        draft: true,
        id,
        overrideAccess: false,
        req,
        user: req.user as TypedUser,
      })) as unknown as Record<string, unknown>

      return text({
        ...described,
        // What landed, compared after the write: a field the key may not
        // update is silently kept by Payload, and should not be reported as
        // restored.
        changed: fields.filter((field) =>
          differs(current[field], updated[field]),
        ),
        dryRun: false,
        preview: buildPreviewUrl({
          collection: COLLECTION,
          slug: updated.slug as string,
        }),
        status: 'draft',
        undo: replaced ? String(replaced.id) : null,
        ...(await whatReadersSee(req, id)),
      })
    },
    name: 'restoreArticleVersion',
    parameters: {
      dryRun: z
        .boolean()
        .optional()
        .describe(
          'Report which fields would change, and write nothing. Defaults to false.',
        ),
      scope: z
        .enum(['body', 'article'])
        .describe(
          '"body" replaces only the body. "article" also replaces the title, ' +
            'excerpt, featured image, SEO title and description, authors and ' +
            'tags. Either way, everything in scope is overwritten, not merged.',
        ),
      versionId: z
        .string()
        .min(1)
        .describe('The `versionId` of an entry from `listArticleVersions`.'),
    },
  },
  {
    description:
      'Replace the body of an existing article with Markdown, saved as a draft. ' +
      'Does not publish, and does not touch the published version of the document. ' +
      'Keep each `<!-- block:... -->` line from readArticleMarkdown where its ' +
      'module should sit, on a line of its own: the module is put back exactly ' +
      'as it was. Leaving a line out removes that module; the response lists ' +
      'which were kept and which removed. Keep each `{#anchor}` at the end ' +
      'of its heading line, even when rewording the heading: it is the ' +
      "section's address. The response lists any anchor removed.",
    handler: async (args: Record<string, unknown>, req: PayloadRequest) => {
      const { markdown, ...target } = args as {
        id?: string
        markdown: string
        slug?: string
      }

      const doc = await findArticle(req, COLLECTION, target)
      const current = (doc as unknown as { content?: EditorState | null })
        .content

      // Before this, every module in the body was lost on a revision: Markdown
      // has no form for one, so it came back as a line of text. See `blocks.ts`.
      // Kept heading anchors likewise ride as `{#anchor}` suffixes and are put
      // back on their headings; see `anchors.ts`.
      const restored = restoreBlocks(
        markdownToLexical(req.payload, COLLECTION, markdown),
        current,
      )
      const { kept, removed } = restored
      const state = restoreAnchors(restored.state)
      const anchors = compareAnchors(current, state)

      const updated = await req.payload.update({
        collection: COLLECTION,
        id: doc.id,
        data: {
          _status: 'draft',
          content: state,
        },
        draft: true,
        overrideAccess: false,
        req,
        user: req.user as TypedUser,
      })

      return text({
        ...(anchors.kept.length ||
        anchors.removed.length ||
        anchors.added.length
          ? {
              anchors: {
                ...anchors,
                ...(anchors.removed.length
                  ? {
                      note:
                        'Removed anchors no longer exist on the page once ' +
                        'published: links and search sitelinks to them land ' +
                        'at the top. Put the {#anchor} back on a heading to ' +
                        'keep one.',
                    }
                  : {}),
              },
            }
          : {}),
        blocks: { kept, removed },
        id: updated.id,
        preview: buildPreviewUrl({
          collection: COLLECTION,
          slug: updated.slug,
        }),
        slug: updated.slug,
        status: 'draft',
        ...(await whatReadersSee(req, updated.id)),
      })
    },
    name: 'updateArticleMarkdown',
    parameters: {
      markdown: z.string().describe('The replacement body, in Markdown.'),
      ...targetShape,
    },
  },
  {
    description:
      "Make small, exact edits to a migrated article's Ghost HTML " +
      '(`legacyHTML`) — wrap a phrase in a link, correct a sentence — saved as ' +
      'a draft. Never publishes, and changes nothing but `legacyHTML`. Each ' +
      '`find` is matched against the stored HTML exactly (copy it from ' +
      '`readLegacyHtml`) and must occur exactly once; edits may not overlap; ' +
      'if any edit is refused, none is made. New markup may only be ' +
      '<a href="…"> (https:// or a /path/ on this site, with `rel` at most), ' +
      '<em>, <strong>, <i> and <b>; markup already in `find` may be kept ' +
      'verbatim. Refused: script, iframe, style, object, embed, event handlers, ' +
      'style attributes, comments, javascript: and data: links; dropping an ' +
      'image, figure, embed or block element that `find` holds; and HTML the ' +
      'browser would have to repair, such as a tag left open. Every link to ' +
      'this site must name an article: the reply says whether each is live or ' +
      'scheduled, and a link to one that is not on the site is refused. The ' +
      'reply shows each edit before and after. Pass `dryRun: true` to see that ' +
      'and save nothing. Refused for an article that renders from its ' +
      'rich-text body (use `updateArticleMarkdown`), and for a key whose user ' +
      'may not write `legacyHTML`, which takes an editor.',
    handler: async (args: Record<string, unknown>, req: PayloadRequest) => {
      const {
        dryRun = false,
        edits,
        ...target
      } = args as {
        dryRun?: boolean
        edits: LegacyEdit[]
        id?: string
        slug?: string
      }

      // The newest version, which is what a draft save is completed from — so
      // the edits are made to the HTML this save will carry forward.
      const doc = (await findArticle(
        req,
        COLLECTION,
        target,
      )) as unknown as Record<string, unknown>
      refuseUnlessLegacy(doc, 'updateArticleMarkdown')
      await refuseUnlessWritable(req, doc, 'legacyHTML')

      const plan = planLegacyEdits(doc.legacyHTML as string, edits)
      const { links, warnings } = await checkAddedLinks(req, plan.links)
      const id = doc.id as number | string
      const described = {
        id,
        slug: doc.slug,
        edits: plan.edits,
        links,
        ...(warnings.length ? { warnings } : {}),
      }

      if (dryRun) {
        return text({
          ...described,
          dryRun: true,
          readers: (await readLiveRow(req, id)).state,
        })
      }

      // The same draft save as `updateArticleMarkdown`, so the same guards
      // run: `keepMcpWritesInDraft`, `refuseMcpPublish`, the `mcp_write` line
      // and the authorship stamp. One field, so nothing else can move —
      // Payload completes the rest of the draft from the newest version.
      const updated = (await req.payload.update({
        collection: COLLECTION,
        data: { _status: 'draft', legacyHTML: plan.html },
        depth: 0,
        draft: true,
        id,
        overrideAccess: false,
        req,
        user: req.user as TypedUser,
      })) as unknown as Record<string, unknown>

      // What landed, not what was sent: Payload keeps a field the key may not
      // write and says nothing.
      if (updated.legacyHTML !== plan.html) {
        throw new Error(
          'The draft was saved without the edits: `legacyHTML` came back ' +
            'unchanged, which is what Payload does with a field this key may ' +
            'not write.',
        )
      }

      return text({
        ...described,
        dryRun: false,
        preview: buildPreviewUrl({
          collection: COLLECTION,
          slug: updated.slug as string,
        }),
        status: 'draft',
        ...(await whatReadersSee(req, id)),
      })
    },
    name: 'editLegacyHtml',
    parameters: {
      ...targetShape,
      dryRun: z
        .boolean()
        .optional()
        .describe(
          'Check every edit and link, show each before and after, and save nothing. Defaults to false.',
        ),
      edits: z
        .array(
          z.object({
            find: z
              .string()
              .min(1)
              .max(LEGACY_EDIT_CHARS)
              .describe(
                'Stored HTML to replace, exactly — character references, ' +
                  'quotes and tags included. Must occur exactly once.',
              ),
            replace: z
              .string()
              .max(LEGACY_EDIT_CHARS)
              .describe(
                'What takes its place. Any image, figure or block element in ' +
                  '`find` must reappear here verbatim.',
              ),
          }),
        )
        .min(1)
        .max(LEGACY_EDITS_MAX)
        .describe(
          `1 to ${LEGACY_EDITS_MAX} edits, made together or not at all. Each \`find\` is looked for in the HTML as it was before any of them.`,
        ),
    },
  },
  {
    description:
      "Convert one migrated article's Ghost HTML (`legacyHTML`) into its " +
      'rich-text body, so the module tools (setFAQBlock, setKeyFactsBlock, ' +
      'setTableBlock) and updateArticleMarkdown can work on it. DRY RUN BY ' +
      'DEFAULT: returns a report and saves nothing — whether the words are ' +
      'the same, every heading id before and after, links and images ' +
      'counted and matched, which Ghost cards became which modules, whether ' +
      'the body survives readArticleMarkdown → updateArticleMarkdown ' +
      'unchanged, and everything refused. Anything that cannot be kept ' +
      'exactly is refused, and a refusal anywhere means nothing is saved. ' +
      'With dryRun: false, saves the conversion as a draft — only when nothing ' +
      'is refused and the rich-text body is empty. Never publishes, and never ' +
      'changes `legacyHTML`: restoring the `undo` version with ' +
      'restoreArticleVersion (scope "body") empties the body again and the ' +
      'page renders from the HTML as before. One article per call. Needs an ' +
      'editor key, as editLegacyHtml does.',
    handler: async (args: Record<string, unknown>, req: PayloadRequest) => {
      const { dryRun = true, ...target } = args as {
        dryRun?: boolean
        id?: string
        slug?: string
      }

      // The newest version, which is what a draft save is completed from — so
      // the HTML converted is the HTML this save carries forward.
      const doc = (await findArticle(
        req,
        COLLECTION,
        target,
      )) as unknown as Record<string, unknown>
      await refuseUnlessWritable(
        req,
        doc,
        'legacyHTML',
        'Converting a migrated article takes an editor or an administrator, ' +
          'as editing its HTML does: it reads `legacyHTML`, markup only an ' +
          'editor may write, and replaces what the page renders from. This ' +
          'key belongs to someone who may not. Ask an editor to convert it.',
      )

      const id = doc.id as number | string
      const article: LegacyArticle = {
        id,
        slug: String(doc.slug ?? ''),
        title: String(doc.title ?? ''),
        legacyHTML: typeof doc.legacyHTML === 'string' ? doc.legacyHTML : '',
        content: doc.content,
      }
      const access = { req, overrideAccess: false }
      const { report, state } = await planLegacyConversion(
        req.payload,
        article,
        access,
      )

      if (dryRun) {
        return text({
          ...report,
          dryRun: true,
          readers: (await readLiveRow(req, id)).state,
        })
      }

      if (!report.convertible) {
        throw new Error(
          `Not converted, and nothing was saved. ${report.refused.join(' ')} ` +
            'Run with dryRun: true for the full report.',
        )
      }

      const { replacedVersion, updated } = await saveLegacyConversion(
        req.payload,
        article,
        state,
        access,
      )

      return text({
        ...report,
        dryRun: false,
        preview: buildPreviewUrl({
          collection: COLLECTION,
          slug: updated.slug as string,
        }),
        status: 'draft',
        undo: replacedVersion,
        rollback:
          'legacyHTML is untouched. To put the page back as it was, restore ' +
          'the `undo` version with restoreArticleVersion, scope "body": the ' +
          'rich-text body empties and the page renders from the HTML again.',
        ...(await whatReadersSee(req, id)),
      })
    },
    name: 'convertLegacyArticle',
    parameters: {
      ...targetShape,
      dryRun: z
        .boolean()
        .optional()
        .describe(
          'Report what the conversion would do, and save nothing. Defaults to true; pass false to save it as a draft.',
        ),
    },
  },
  {
    description:
      'Set the key facts on an article: short label and value pairs ' +
      '("Insect" / "Dactylopius coccus") shown as a fact card in the body. ' +
      'If the article already has key facts they are replaced where they ' +
      'stand; otherwise they are inserted directly under the body heading ' +
      'named in `afterHeading`. The call describes the whole card, heading ' +
      'included. Saved as a draft and never published; the rest of the body ' +
      'is left exactly as it is. Refused for an article that still renders ' +
      'from migrated Ghost HTML.',
    handler: async (args: Record<string, unknown>, req: PayloadRequest) => {
      const { afterHeading, facts, heading, replacePipeTable, ...target } =
        args as {
          afterHeading?: string
          facts: Fact[]
          heading?: string
          id?: string
          replacePipeTable?: boolean
          slug?: string
        }

      const doc = (await findArticle(
        req,
        COLLECTION,
        target,
      )) as unknown as Record<string, unknown>

      refuseLegacyBody(doc, 'key facts')

      const result = setKeyFacts(doc.content as EditorState | null, {
        afterHeading,
        facts,
        heading,
        replacePipeTable,
      })

      const updated = await req.payload.update({
        collection: COLLECTION,
        id: doc.id as number | string,
        data: { _status: 'draft', content: result.state },
        draft: true,
        overrideAccess: false,
        req,
        user: req.user as TypedUser,
      })

      return text({
        afterHeading: result.afterHeading,
        id: updated.id,
        keyFacts: {
          facts: facts.length,
          heading: heading?.trim() || null,
          key: result.key,
          marker: result.marker,
        },
        placement: result.placement,
        preview: buildPreviewUrl({
          collection: COLLECTION,
          slug: updated.slug,
        }),
        removedTable: result.removedTable,
        slug: updated.slug,
        status: 'draft',
        ...(await whatReadersSee(req, updated.id)),
      })
    },
    name: 'setKeyFactsBlock',
    parameters: {
      afterHeading: z
        .string()
        .optional()
        .describe(
          'Where the facts go when the article has none yet: the text of a ' +
            'heading in the body, e.g. "The short answer". They are placed ' +
            'directly under it. Ignored when the article already has key ' +
            'facts; move those by moving their marker line in ' +
            'updateArticleMarkdown.',
        ),
      facts: z
        .array(
          z.object({
            label: z
              .string()
              .min(1)
              .describe('What the fact is about, e.g. "Insect". A few words.'),
            value: z
              .string()
              .min(1)
              .describe('The fact, e.g. "Dactylopius coccus". A few words.'),
          }),
        )
        .min(1)
        .max(KEY_FACTS_MAX_ITEMS)
        .describe(
          `The facts, in the order a reader should see them, 1 to ` +
            `${KEY_FACTS_MAX_ITEMS}. Replaces any facts the article already ` +
            'has.',
        ),
      heading: z
        .string()
        .optional()
        .describe(
          'Optional label on the card, e.g. "At a glance". Leave it out when ' +
            'a body heading already introduces the facts. Leaving it out also ' +
            'removes a heading the card had.',
        ),
      replacePipeTable: z
        .boolean()
        .optional()
        .describe(
          'When inserting, also remove the Markdown table directly under ' +
            '`afterHeading`. A table typed in Markdown is stored as a ' +
            'paragraph of literal | characters and prints as pipes on the ' +
            'page; this swaps it for the card. Refused if there is no such ' +
            'table there.',
        ),
      ...targetShape,
    },
  },
  {
    description:
      'Set the FAQ on an article: questions and their answers, shown in the ' +
      'body as a list of questions that open to their answers, and ' +
      'described to search engines as an FAQ. If the article already has ' +
      'an FAQ it is replaced where it stands, keeping its heading unless ' +
      '`heading` is given. Otherwise it goes under the body heading named ' +
      'in `afterHeading` — or, with `replaceExisting`, takes the place of ' +
      "that heading's whole section, which is how to convert an FAQ written " +
      'in Markdown. Answers are Markdown. The call describes every question: ' +
      'any left out are removed. Saved as a draft and never published; the ' +
      'rest of the body is left exactly as it is. Refused for an article ' +
      'that still renders from migrated Ghost HTML.',
    handler: async (args: Record<string, unknown>, req: PayloadRequest) => {
      const { afterHeading, heading, items, replaceExisting, ...target } =
        args as {
          afterHeading?: string
          heading?: string
          id?: string
          items: FaqInputItem[]
          replaceExisting?: boolean
          slug?: string
        }

      const doc = (await findArticle(
        req,
        COLLECTION,
        target,
      )) as unknown as Record<string, unknown>

      refuseLegacyBody(doc, 'an FAQ')

      const result = setFaq(
        doc.content as EditorState | null,
        { afterHeading, heading, items, replaceExisting },
        // Against the answer field's own editor, not the body's.
        (markdown) =>
          markdownToBlockRichText(
            req.payload,
            COLLECTION,
            FAQ_BLOCK,
            ['items', 'answer'],
            markdown,
          ),
      )

      const updated = await req.payload.update({
        collection: COLLECTION,
        id: doc.id as number | string,
        data: { _status: 'draft', content: result.state },
        draft: true,
        overrideAccess: false,
        req,
        user: req.user as TypedUser,
      })

      return text({
        afterHeading: result.afterHeading,
        faq: {
          heading: result.heading,
          key: result.key,
          marker: result.marker,
          questions: items.length,
        },
        id: updated.id,
        placement: result.placement,
        preview: buildPreviewUrl({
          collection: COLLECTION,
          slug: updated.slug,
        }),
        replacedSection: result.replacedSection,
        slug: updated.slug,
        status: 'draft',
        ...(await whatReadersSee(req, updated.id)),
      })
    },
    name: 'setFAQBlock',
    parameters: {
      afterHeading: z
        .string()
        .optional()
        .describe(
          'Where the FAQ goes when the article has none yet: the text of a ' +
            'heading in the body, e.g. "FAQ". Ignored when the article ' +
            'already has an FAQ; move that by moving its marker line in ' +
            'updateArticleMarkdown.',
        ),
      heading: z
        .string()
        .optional()
        .describe(
          'The heading the FAQ shows, e.g. "FAQ". Left out, an existing FAQ ' +
            'keeps its heading, one that replaces a section takes that ' +
            'section\'s heading, and any other shows "Frequently asked ' +
            'questions". The FAQ always shows a heading of its own, so ' +
            'inserting it directly under a body heading such as "## FAQ" ' +
            'gives two in a row — use replaceExisting for that.',
        ),
      items: z
        .array(
          z.object({
            answer: z
              .string()
              .min(1)
              .describe(
                'The answer, in Markdown: a paragraph or two, with links, ' +
                  'bold and lists if needed. No headings.',
              ),
            question: z
              .string()
              .min(1)
              .describe('The question, as a reader would ask it.'),
          }),
        )
        .min(1)
        .describe(
          'Every question, in the order a reader should see them. Replaces ' +
            'any questions the article already has.',
        ),
      replaceExisting: z
        .boolean()
        .optional()
        .describe(
          'When the article has no FAQ yet: instead of inserting under ' +
            '`afterHeading`, replace that heading and everything below it, ' +
            'up to the next heading of the same or higher level, with the ' +
            "FAQ — which takes that heading's text. This converts an FAQ " +
            'written in Markdown. Refused if the section holds an image or ' +
            'another module, which would be lost.',
        ),
      ...targetShape,
    },
  },
  {
    description:
      'Set a comparison table in an article: a caption, a header row and ' +
      'rows of values, shown as a real table that scrolls sideways on a ' +
      'phone. The first column names the rows: `columns[0]` heads it (may ' +
      'be blank) and each row starts with its label. Row labels and cells ' +
      'take inline Markdown — italics, bold, code, links. Replaces the table ' +
      'named by `key`; otherwise the table in the section under ' +
      '`afterHeading`, or inserts one directly under that heading if the ' +
      "section has none; with neither, the article's only table. " +
      'Leave out columns and rows with replacePipeTable to read them from ' +
      'the Markdown table under the heading. Saved as a draft and never ' +
      'published; the rest of the body is left exactly as it is. Refused ' +
      'for an article that still renders from migrated Ghost HTML.',
    handler: async (args: Record<string, unknown>, req: PayloadRequest) => {
      const {
        afterHeading,
        caption,
        columns,
        key,
        replacePipeTable,
        rows,
        ...target
      } = args as {
        afterHeading?: string
        caption: string
        columns?: string[]
        id?: string
        key?: string
        replacePipeTable?: boolean
        rows?: string[][]
        slug?: string
      }

      const doc = (await findArticle(
        req,
        COLLECTION,
        target,
      )) as unknown as Record<string, unknown>

      refuseLegacyBody(doc, 'a comparison table')

      const result = setTable(
        doc.content as EditorState | null,
        { afterHeading, caption, columns, key, replacePipeTable, rows },
        // The pipe paragraph, back as the Markdown it was typed as — with the
        // body's converter, so formatting inside a cell comes back with it.
        (node) =>
          lexicalToMarkdown(
            req.payload,
            COLLECTION,
            withChildren(null, [node]),
          ),
      )

      const updated = await req.payload.update({
        collection: COLLECTION,
        id: doc.id as number | string,
        data: { _status: 'draft', content: result.state },
        draft: true,
        overrideAccess: false,
        req,
        user: req.user as TypedUser,
      })

      return text({
        afterHeading: result.afterHeading,
        id: updated.id,
        placement: result.placement,
        preview: buildPreviewUrl({
          collection: COLLECTION,
          slug: updated.slug,
        }),
        removedTable: result.removedTable,
        slug: updated.slug,
        status: 'draft',
        ...(await whatReadersSee(req, updated.id)),
        table: {
          columns: result.columns,
          key: result.key,
          marker: result.marker,
          parsedFromPipeTable: result.parsedFromPipeTable,
          rows: result.rows,
        },
      })
    },
    name: 'setTableBlock',
    parameters: {
      afterHeading: z
        .string()
        .optional()
        .describe(
          'A heading in the body, e.g. "How the reds compare". The table in ' +
            'its section is replaced; if the section has none, a new table ' +
            'goes directly under the heading.',
        ),
      caption: z
        .string()
        .min(1)
        .describe(
          'What the table shows, as a sentence. Required: it is read out ' +
            'before the table, and often the only description a search ' +
            'result gets.',
        ),
      columns: z
        .array(z.string())
        .min(2)
        .max(TABLE_MAX_COLUMNS + 1)
        .optional()
        .describe(
          'The header row. The first heads the column naming the rows (may ' +
            `be ""); the rest, 1 to ${TABLE_MAX_COLUMNS}, head the columns of ` +
            'values. Leave out, with rows, to read them from the Markdown ' +
            'table under afterHeading.',
        ),
      key: z
        .string()
        .optional()
        .describe(
          'Replace this table: the key from its `<!-- block:comparisonTable:' +
            'key -->` line in readArticleMarkdown. Needed when a section or ' +
            'an article has more than one table.',
        ),
      replacePipeTable: z
        .boolean()
        .optional()
        .describe(
          'When inserting, also remove the Markdown table directly under ' +
            '`afterHeading`, which the body stores as a paragraph of literal ' +
            '| characters and prints as pipes. Implied when columns and rows ' +
            'are left out, since the table is read from it. Refused if there ' +
            'is no such table there.',
        ),
      rows: z
        .array(z.array(z.string()))
        .min(1)
        .max(TABLE_MAX_ROWS)
        .optional()
        .describe(
          `The rows, 1 to ${TABLE_MAX_ROWS}. Each starts with its label, then ` +
            'one value per column; a short row is padded with blanks. Inline ' +
            'Markdown allowed.',
        ),
      ...targetShape,
    },
  },
  {
    description:
      'Upload an image to the Media library from base64 and return its id, ' +
      "for use as a post's featuredImage via `updatePosts`. Accepts PNG, " +
      'JPEG and WebP up to 8MB; SVG is refused. Images are marked as ' +
      'generated unless told otherwise, so the archive stays auditable. ' +
      '`alt` is required and should describe what the image shows, not that ' +
      'it is an illustration.',
    handler: async (args: Record<string, unknown>, req: PayloadRequest) => {
      const {
        aiGenerated = true,
        alt,
        base64,
        caption,
        credit,
        filename,
      } = args as {
        aiGenerated?: boolean
        alt: string
        base64: string
        caption?: string
        credit?: string
        filename?: string
      }

      const file = decodeImageUpload({ base64, filename: filename ?? alt })

      const created = await req.payload.create({
        collection: 'media',
        data: { aiGenerated, alt, caption, credit },
        file,
        // The key's own user, under the collection's `editorsAndAdmins` create
        // rule — an agent cannot upload anything a person with that key could
        // not upload through the admin panel.
        overrideAccess: false,
        req,
        user: req.user as TypedUser,
      })

      return text({
        aiGenerated: created.aiGenerated ?? false,
        alt: created.alt,
        filename: created.filename,
        id: created.id,
        mimetype: file.mimetype,
        sizeBytes: file.size,
        url: created.url,
      })
    },
    name: 'uploadMedia',
    parameters: {
      aiGenerated: z
        .boolean()
        .optional()
        .describe(
          'Whether the image was generated rather than photographed or drawn. ' +
            'Defaults to true, which is the safe assumption on this path: an ' +
            'unmarked generated image is the failure worth avoiding. Pass ' +
            'false only when relaying a real photograph of a real work.',
        ),
      alt: z
        .string()
        .min(1)
        .describe(
          'Alternative text describing what the image shows. Required.',
        ),
      base64: z
        .string()
        .min(1)
        .describe(
          'The image file as base64, optionally as a data: URL. PNG, JPEG or ' +
            'WebP.',
        ),
      caption: z
        .string()
        .optional()
        .describe('Caption shown under the image, when it has one.'),
      credit: z
        .string()
        .optional()
        .describe(
          'Credit line shown after the caption. Say where a generated image ' +
            'came from here, so a reader sees it and not just an editor.',
        ),
      filename: z
        .string()
        .optional()
        .describe(
          'Preferred filename. Sanitised, and its extension is replaced with ' +
            'the real format. Defaults to something derived from the alt text.',
        ),
    },
  },
  {
    description:
      'Add an image to the Media library by giving its https address, and ' +
      "return its id for use as a post's featuredImage via `updatePosts`. " +
      'Use this rather than `uploadMedia` from any client that cannot hold a ' +
      'whole file in a message — a phone connector, a scheduled run. Accepts ' +
      'PNG, JPEG and WebP up to 8MB; SVG is refused. Only public https ' +
      'addresses are fetched. Images are marked as generated unless told ' +
      'otherwise, so the archive stays auditable.',
    handler: async (args: Record<string, unknown>, req: PayloadRequest) => {
      const {
        aiGenerated = true,
        alt,
        caption,
        credit,
        filename,
        url,
      } = args as {
        aiGenerated?: boolean
        alt: string
        caption?: string
        credit?: string
        filename?: string
        url: string
      }

      let fetched
      try {
        fetched = await fetchPublicBytes(url, MAX_AGENT_UPLOAD_BYTES)
      } catch (error) {
        // The guard's refusals are written for a model to act on, so they are
        // passed through rather than flattened into a generic failure. Anything
        // else is not: an unexpected error here describes this server's
        // internals to a caller who chose the address.
        if (error instanceof OutboundFetchError) throw error
        throw new Error('The image could not be downloaded.')
      }

      // Nothing the response said about the bytes is trusted. The format comes
      // from the file's own leading bytes, exactly as on the base64 path — a
      // `Content-Type: image/png` on an SVG buys nothing.
      const file = vetImageBytes(fetched.bytes, filename ?? alt)

      const created = await req.payload.create({
        collection: 'media',
        data: { aiGenerated, alt, caption, credit },
        file,
        overrideAccess: false,
        req,
        user: req.user as TypedUser,
      })

      return text({
        aiGenerated: created.aiGenerated ?? false,
        alt: created.alt,
        filename: created.filename,
        id: created.id,
        mimetype: file.mimetype,
        sizeBytes: file.size,
        sourceUrl: fetched.url,
        url: created.url,
      })
    },
    name: 'uploadMediaFromUrl',
    parameters: {
      aiGenerated: z
        .boolean()
        .optional()
        .describe(
          'Whether the image was generated rather than photographed or drawn. ' +
            'Defaults to true, which is the safe assumption on this path: an ' +
            'unmarked generated image is the failure worth avoiding. Pass ' +
            'false only when relaying a real photograph of a real work.',
        ),
      alt: z
        .string()
        .min(1)
        .describe(
          'Alternative text describing what the image shows. Required.',
        ),
      caption: z
        .string()
        .optional()
        .describe('Caption shown under the image, when it has one.'),
      credit: z
        .string()
        .optional()
        .describe(
          'Credit line shown after the caption. Say where a generated image ' +
            'came from here, so a reader sees it and not just an editor.',
        ),
      filename: z
        .string()
        .optional()
        .describe(
          'Preferred filename. Sanitised, and its extension is replaced with ' +
            'the real format. Defaults to something derived from the alt text.',
        ),
      url: z
        .string()
        .min(1)
        .describe(
          'The https address of the image. Must be publicly reachable: ' +
            'private, loopback and link-local addresses are refused, at every ' +
            'redirect.',
        ),
    },
  },
  {
    description:
      'Publish an article as its newest version — the latest draft, exactly as ' +
      '`readArticleMarkdown` shows it — or schedule it. Leave `publishAt` out to ' +
      "keep the article's date: a live article is updated in place, a scheduled " +
      'one keeps its slot. For an article that is not live yet, pass "now" or a ' +
      'time ahead, such as 2026-11-04T20:00:00Z, to publish or schedule it. A ' +
      "live article's date, address and canonical URL are never changed here — " +
      'moving the date ahead would take its page off the site. Refused unless ' +
      'the key belongs to an administrator, or the connector was granted ' +
      'publishing. Pass `dryRun: true` first: it says what would go out, when, ' +
      'and whether this key may publish, and writes nothing.',
    handler: async (args: Record<string, unknown>, req: PayloadRequest) => {
      const {
        dryRun = false,
        publishAt,
        ...target
      } = args as {
        dryRun?: boolean
        id?: string
        publishAt?: string
        slug?: string
      }
      const now = new Date()

      // The newest version, whole: what the admin panel's Publish button
      // sends. Payload would complete a partial write from it anyway; sending
      // it is what makes the result checkable before anything is written.
      const draft = (await findArticle(
        req,
        COLLECTION,
        target,
      )) as unknown as Record<string, unknown>
      const id = draft.id as number | string
      const live = await readLiveRow(req, id, now)
      const requested = resolvePublishAt(publishAt, now)

      if (live.state === 'live') {
        if (requested !== undefined) {
          throw new Error(
            `This article has been live since ${live.publishedAt ?? 'it was published'}, ` +
              'and its date is not moved here: a date ahead would take its page ' +
              'off the site until then, and "now" would re-date it to the top of ' +
              'every listing. Leave `publishAt` out to publish its changes in ' +
              'place, or change the date in the admin panel.',
          )
        }
        const moved = FIXED_WHILE_LIVE.filter((field) =>
          differs(live.doc?.[field], draft[field]),
        )
        if (moved.length) {
          throw new Error(
            `The draft changes this live article's ${moved.join(' and ')}, ` +
              'which moves what crawlers have cached. Put it back with ' +
              '`updatePosts`, or publish from the admin panel, where a redirect ' +
              'can be added at the same time.',
          )
        }
      }

      const draftDate =
        typeof draft.publishedAt === 'string' && draft.publishedAt
          ? draft.publishedAt
          : null
      const publishedAt =
        live.state === 'live' ? live.publishedAt : (requested ?? draftDate)

      if (
        live.state !== 'live' &&
        requested === undefined &&
        draftDate &&
        Date.parse(draftDate) <= now.getTime()
      ) {
        throw new Error(
          `This article is not live, and the date it carries (${draftDate}) ` +
            'has passed. Published as it is, it would go out backdated — below ' +
            'newer articles in every listing and in the feed. Pass ' +
            '`publishAt: "now"` to publish it today, or a time ahead to ' +
            'schedule it.',
        )
      }

      const data: Record<string, unknown> = Object.fromEntries(
        Object.entries(draft).filter(([field]) => !SYSTEM_FIELDS.has(field)),
      )
      data._status = 'published'
      // Left out when there is none: `stampPublishedAt` dates it on publish.
      if (publishedAt) data.publishedAt = publishedAt
      else delete data.publishedAt

      const goesOut =
        publishedAt && Date.parse(publishedAt) > now.getTime()
          ? 'scheduled'
          : 'live'
      const slug = String(draft.slug ?? '')
      const described = {
        id,
        slug,
        title: draft.title,
        before: live.state,
        after: goesOut,
        publishedAt: publishedAt ?? now.toISOString(),
        url: absoluteUrl(postPath(slug), getSiteUrl()),
        // What readers will see change. Null for an article never published,
        // where all of it is new. `lastEditedBy` is bookkeeping, not content.
        changes:
          live.state !== 'unpublished' && live.doc
            ? Object.keys(data).filter(
                (field) =>
                  !NOT_READER_FACING.has(field) &&
                  differs(live.doc![field], data[field]),
              )
            : null,
      }

      if (dryRun) {
        return text({
          ...described,
          dryRun: true,
          mayPublish: mayPublishThrough(req),
        })
      }

      // `refuseMcpPublish` decides here, on the same rule `mayPublish` read.
      const updated = (await req.payload.update({
        collection: COLLECTION,
        data,
        depth: 0,
        draft: false,
        id,
        overrideAccess: false,
        req,
        user: req.user as TypedUser,
      })) as unknown as Record<string, unknown>

      const finalDate =
        typeof updated.publishedAt === 'string'
          ? updated.publishedAt
          : described.publishedAt
      return text({
        ...described,
        dryRun: false,
        publishedAt: finalDate,
        status: updated._status,
        appears:
          goesOut === 'scheduled'
            ? `On ${finalDate}, within ${SCHEDULE_GRANULARITY_SECONDS / 60} minutes. Nothing else needs to happen.`
            : `Now, within ${SCHEDULE_GRANULARITY_SECONDS / 60} minutes at most as cached pages turn over.`,
      })
    },
    name: 'publishArticle',
    parameters: {
      ...targetShape,
      dryRun: z
        .boolean()
        .optional()
        .describe(
          'Say what would go out, when, and whether this key may publish; write nothing.',
        ),
      publishAt: z
        .string()
        .optional()
        .describe(
          'Only for an article that is not live yet: "now", or an ISO 8601 ' +
            'time with its offset, such as 2026-11-04T20:00:00Z. Left out, the ' +
            'article keeps the date it has.',
        ),
    },
  },
  {
    description:
      'Where the publishing schedule stands, read-only. Lists what is ' +
      'scheduled in the next `days` (default 14) and what went live in the ' +
      'last `days`, each with its address and time; and, separately, work ' +
      'that is saved but not out: live articles whose newest version is a ' +
      'draft nobody published (readers still see the published one), ' +
      'scheduled articles in the same state (they go out as last published), ' +
      'and drafts carrying a date that has passed (a date on a draft ' +
      'schedules nothing). Use it to check a schedule went out as planned, and ' +
      'before choosing a slot with `publishArticle`.',
    handler: async (args: Record<string, unknown>, req: PayloadRequest) => {
      const { days = 14 } = args as { days?: number }
      const now = new Date()
      const span = days * 24 * 60 * 60 * 1000
      const siteUrl = getSiteUrl()

      const listed = async (where: Where, sort: string) => {
        const { docs, totalDocs } = await req.payload.find({
          collection: COLLECTION,
          depth: 0,
          limit: 100,
          overrideAccess: false,
          req,
          select: { publishedAt: true, slug: true, title: true },
          sort,
          user: req.user,
          where,
        })
        return {
          articles: (docs as unknown as Array<Record<string, unknown>>).map(
            (doc) => ({
              id: doc.id,
              publishedAt: doc.publishedAt ?? null,
              slug: doc.slug,
              title: doc.title,
              url: absoluteUrl(postPath(String(doc.slug ?? '')), siteUrl),
            }),
          ),
          total: totalDocs,
        }
      }

      const published: Where = { _status: { equals: 'published' } }
      const [scheduled, wentLive, unpublished] = await Promise.all([
        listed(
          {
            and: [
              published,
              { publishedAt: { greater_than: now.toISOString() } },
              {
                publishedAt: {
                  less_than_equal: new Date(now.getTime() + span).toISOString(),
                },
              },
            ],
          },
          'publishedAt',
        ),
        listed(
          {
            and: [
              published,
              { publishedAt: { less_than_equal: now.toISOString() } },
              {
                publishedAt: {
                  greater_than: new Date(now.getTime() - span).toISOString(),
                },
              },
            ],
          },
          '-publishedAt',
        ),
        findUnpublishedWork(req.payload, {
          now,
          user: req.user as TypedUser,
        }),
      ])

      return text({
        now: now.toISOString(),
        days,
        // How late a scheduled article may appear after its time: nothing
        // wakes up to release it; cached pages turn over.
        releaseWithinMinutes: SCHEDULE_GRANULARITY_SECONDS / 60,
        scheduled,
        wentLive,
        savedButNotOut: unpublished,
      })
    },
    name: 'editorialStatus',
    parameters: {
      days: z
        .number()
        .int()
        .min(1)
        .max(90)
        .optional()
        .describe(
          'How far ahead to list scheduled articles, and how far back to list ' +
            'ones that went live. Defaults to 14; at most 90.',
        ),
    },
  },
]
