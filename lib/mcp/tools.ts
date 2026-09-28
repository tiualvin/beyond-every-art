// Custom MCP tools for drafting, illustrating, and looking back.
//
// The plugin's generated CRUD tools are enough to read and edit documents, but
// not to write one: they expose `content` as raw Lexical editor state (see
// `markdown.ts`). Nor can they carry a file, so an image has no way in at all. These tools close both gaps, so an agent's
// job is to write and illustrate the article rather than to satisfy the schema.
// Nor do they reach version history, which Payload keeps for every save; the
// version tools read it, and `restoreArticleVersion` reverts to it — as a
// draft, and never touching what decides where and to whom a post is served.
//
// `@payloadcms/plugin-mcp` still has no `defineTool` helper at `3.88.0`, the
// release this project pins — it is documented on Payload's main branch but has
// not shipped — so tools are declared as plain objects against the `mcp.tools`
// config type. Re-check on the next version bump: adopting the helpers is a
// refactor of this file, not a config change.

import type { MCPPluginConfig } from '@payloadcms/plugin-mcp'
import type { PayloadRequest, TypedUser } from 'payload'
import { z } from 'zod'

import { FAQ_BLOCK, KEY_FACTS_MAX_ITEMS } from '../../blocks/schema'
import { toArticleBody } from '../content/body'
import { htmlToPlainText, richTextToPlainText } from '../content/plain-text'
import { buildPreviewUrl } from '../preview/live-preview'
import { listBlocks, markBlocks, restoreBlocks } from './blocks'
import { setFaq, type FaqInputItem } from './faq'
import { setKeyFacts, type Fact } from './key-facts'
import { withChildren } from './placement'
import { setTable, TABLE_MAX_COLUMNS, TABLE_MAX_ROWS } from './table'
import {
  blockFieldsForReading,
  lexicalToMarkdown,
  markdownToBlockRichText,
  markdownToLexical,
  type EditorState,
  type MarkdownCollection,
} from './markdown'
import { decodeImageUpload, vetImageBytes } from './upload'
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
    markdown: rendersFromLegacyHTML(doc)
      ? '(This document renders from migrated Ghost HTML (`legacyHTML`), not from the ' +
        'rich-text body. Editing it as Markdown would not change the published page.)'
      : lexicalToMarkdown(
          req.payload,
          COLLECTION,
          content && markBlocks(content),
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

      const created = await req.payload.create({
        collection: 'posts',
        data: {
          _status: 'draft',
          content: markdownToLexical(req.payload, 'posts', markdown),
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
      'listed in `blocks`.',
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
      'which were kept and which removed.',
    handler: async (args: Record<string, unknown>, req: PayloadRequest) => {
      const { markdown, ...target } = args as {
        id?: string
        markdown: string
        slug?: string
      }

      const doc = await findArticle(req, COLLECTION, target)

      // Before this, every module in the body was lost on a revision: Markdown
      // has no form for one, so it came back as a line of text. See `blocks.ts`.
      const { state, kept, removed } = restoreBlocks(
        markdownToLexical(req.payload, COLLECTION, markdown),
        (doc as unknown as { content?: EditorState | null }).content,
      )

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
        blocks: { kept, removed },
        id: updated.id,
        preview: buildPreviewUrl({
          collection: COLLECTION,
          slug: updated.slug,
        }),
        slug: updated.slug,
        status: 'draft',
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
]
