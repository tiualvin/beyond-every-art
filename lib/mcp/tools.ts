// Custom MCP tools for drafting.
//
// The plugin's generated CRUD tools are enough to read and edit documents, but
// not to write one: they expose `content` as raw Lexical editor state (see
// `markdown.ts`) and `ghostID` as a required field. These three tools close
// both gaps, so an agent's job is to write the article rather than to satisfy
// the schema.
//
// `@payloadcms/plugin-mcp@3.86.0` has no `defineTool` helper — that is a later
// API than the release this project pins — so tools are declared as plain
// objects against the `mcp.tools` config type.

import type { MCPPluginConfig } from '@payloadcms/plugin-mcp'
import { randomUUID } from 'node:crypto'
import type { PayloadRequest, TypedUser } from 'payload'
import { z } from 'zod'

import { buildPreviewUrl } from '../preview/live-preview'
import {
  lexicalToMarkdown,
  markdownToLexical,
  type MarkdownCollection,
} from './markdown'

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

/**
 * External identifier for an article that did not come from Ghost.
 *
 * `ghostID` is required and unique on Posts because it is what makes the Ghost
 * import idempotent, and it must stay that way until the final import is done.
 * A prefixed synthetic value satisfies the field without weakening it: it can
 * never collide with a Ghost ObjectID, `pnpm migrate:validate` keys on the IDs
 * the export actually contains, and `native:` makes natively authored articles
 * greppable when the field is eventually relaxed.
 */
export function nativeGhostID(): string {
  return `native:${randomUUID()}`
}

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

  const found = new Map(
    docs.map((doc) => [(doc as { slug: string }).slug, doc.id]),
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

async function findArticle(
  req: PayloadRequest,
  collection: MarkdownCollection,
  args: { id?: string; slug?: string },
) {
  if (args.id) {
    return req.payload.findByID({
      collection,
      id: args.id,
      draft: true,
      overrideAccess: false,
      req,
      user: req.user as TypedUser,
    })
  }

  if (!args.slug) throw new Error('Provide either `id` or `slug`.')

  const { docs } = await req.payload.find({
    collection,
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

const targetShape = {
  id: z.string().optional().describe('Document id. Provide this or `slug`.'),
  slug: z.string().optional().describe('Document slug. Provide this or `id`.'),
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
          ghostID: nativeGhostID(),
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
      'Use this before revising, so edits are made against the current text.',
    handler: async (args: Record<string, unknown>, req: PayloadRequest) => {
      const target = args as { id?: string; slug?: string }

      const doc = (await findArticle(
        req,
        COLLECTION,
        target,
      )) as unknown as Record<string, unknown>

      return text({
        excerpt: doc.excerpt ?? null,
        id: doc.id,
        // Migrated bodies live in `legacyHTML` and are not Lexical; say so
        // rather than returning an empty string that reads like an empty post.
        markdown: doc.legacyHTML
          ? '(This document renders from migrated Ghost HTML (`legacyHTML`), not from the ' +
            'rich-text body. Editing it as Markdown would not change the published page.)'
          : lexicalToMarkdown(
              req.payload,
              COLLECTION,
              doc.content as Parameters<typeof lexicalToMarkdown>[2],
            ),
        slug: doc.slug,
        status: doc._status ?? null,
        title: doc.title,
      })
    },
    name: 'readArticleMarkdown',
    parameters: targetShape,
  },
  {
    description:
      'Replace the body of an existing article with Markdown, saved as a draft. ' +
      'Does not publish, and does not touch the published version of the document.',
    handler: async (args: Record<string, unknown>, req: PayloadRequest) => {
      const { markdown, ...target } = args as {
        id?: string
        markdown: string
        slug?: string
      }

      const doc = await findArticle(req, COLLECTION, target)

      const updated = await req.payload.update({
        collection: COLLECTION,
        id: doc.id,
        data: {
          _status: 'draft',
          content: markdownToLexical(req.payload, COLLECTION, markdown),
        },
        draft: true,
        overrideAccess: false,
        req,
        user: req.user as TypedUser,
      })

      return text({
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
]
