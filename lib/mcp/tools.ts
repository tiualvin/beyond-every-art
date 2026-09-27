// Custom MCP tools for drafting and illustrating.
//
// The plugin's generated CRUD tools are enough to read and edit documents, but
// not to write one: they expose `content` as raw Lexical editor state (see
// `markdown.ts`). Nor can they carry a file, so an image has no way in at all. These tools close both gaps, so an agent's
// job is to write and illustrate the article rather than to satisfy the schema.
//
// `@payloadcms/plugin-mcp` still has no `defineTool` helper at `3.88.0`, the
// release this project pins — it is documented on Payload's main branch but has
// not shipped — so tools are declared as plain objects against the `mcp.tools`
// config type. Re-check on the next version bump: adopting the helpers is a
// refactor of this file, not a config change.

import type { MCPPluginConfig } from '@payloadcms/plugin-mcp'
import type { PayloadRequest, TypedUser } from 'payload'
import { z } from 'zod'

import { buildPreviewUrl } from '../preview/live-preview'
import {
  lexicalToMarkdown,
  markdownToLexical,
  type MarkdownCollection,
} from './markdown'
import { logMcpEvent, mcpStockLogEntry } from './audit'
import {
  configuredLimit,
  FixedWindowRateLimiter,
  retryAfterSeconds,
} from './rate-limit'
import { decodeImageUpload, vetImageBytes } from './upload'
import { MAX_AGENT_UPLOAD_BYTES } from '../security/uploads'
import {
  fetchPublicBytes,
  OutboundFetchError,
} from '../security/outbound-fetch'
import {
  attributionFor,
  imageAddress,
  isPhotoId,
  MAX_PAGE,
  NOT_CONFIGURED,
  ORIENTATIONS,
  photoPageURL,
  StockPhotoError,
  unsplashClient,
  type Orientation,
} from '../stock/unsplash'

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

/**
 * Stock-photo calls per user per hour, unless `RATE_LIMIT_STOCK_PER_HOUR` says
 * otherwise.
 *
 * The MCP limit is 120 requests per key per *minute*; Unsplash's demo quota is
 * 50 an hour for the whole deployment. One agent looping on a search would
 * spend the hour in under half a minute and leave every other key without
 * stock search until it reset. This holds one caller to a share of the quota.
 * A person choosing a feature image needs a search or two and one import per
 * article, so the ceiling costs the real workflow nothing.
 */
const STOCK_LIMIT = 20
const STOCK_WINDOW_MS = 60 * 60_000

const stockLimiter = new FixedWindowRateLimiter(
  configuredLimit('RATE_LIMIT_STOCK_PER_HOUR', STOCK_LIMIT),
  STOCK_WINDOW_MS,
)

/** Spends one unit of the caller's stock budget, or refuses with when to retry. */
function spendStockBudget(req: PayloadRequest): void {
  const result = stockLimiter.check(`user:${String(req.user?.id ?? 'none')}`)
  if (!result.allowed) {
    throw new StockPhotoError(
      'The stock-photo budget for this user is spent for the hour. Try again ' +
        `in ${retryAfterSeconds(result.resetAt)} seconds.`,
    )
  }
}

/**
 * Passes refusals written for a model through, and flattens anything else,
 * which would describe this server to its caller.
 */
function stockFailure(error: unknown, fallback: string): Error {
  if (error instanceof StockPhotoError) return error
  if (error instanceof OutboundFetchError) return error
  return new Error(fallback)
}

/**
 * The house rule on stock photographs, carried in both tool descriptions
 * because the description is the only thing an agent reads before it chooses.
 * docs/STOCK_IMAGERY.md, Finding 5 and Decision 3.
 */
const STOCK_RULE =
  'House rule: stock photographs are for mood only — atmosphere, texture, ' +
  'abstraction, or the header for an essay about an idea. Never use one ' +
  'where a reader could take it as a picture of the work, place or person ' +
  'the article names: this publication writes about specific works, and a ' +
  'stock photograph there reads as documentation of them.'

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
      'Search Unsplash for a photograph to use as an article’s feature ' +
      'image. Returns up to six candidates, each with a small `preview` ' +
      'address. Show the previews to the person and let them choose — do ' +
      'not import one they have not seen — then call `importStockPhoto` ' +
      'with the chosen `id`. ' +
      STOCK_RULE +
      ' Each call spends a small shared hourly quota, so search ' +
      'deliberately rather than paging through results.',
    handler: async (args: Record<string, unknown>, req: PayloadRequest) => {
      const { orientation, page, query } = args as {
        orientation?: Orientation
        page?: number
        query: string
      }

      const unsplash = unsplashClient()
      if (!unsplash) throw new StockPhotoError(NOT_CONFIGURED)

      spendStockBudget(req)

      try {
        const result = await unsplash.search({ orientation, page, query })
        return text({
          ...result,
          next: result.candidates.length
            ? 'Show these previews to the person and let them choose. Then ' +
              'call importStockPhoto with the chosen id and alt text.'
            : 'Nothing usable matched. Try different words — describe the ' +
              'mood or texture rather than a subject.',
          page: page ?? 1,
        })
      } catch (error) {
        throw stockFailure(error, 'The stock search failed.')
      }
    },
    name: 'findStockPhoto',
    parameters: {
      orientation: z
        .enum(ORIENTATIONS)
        .optional()
        .describe(
          'Shape of the photograph. Feature images are wide, so `landscape` ' +
            'is usually right.',
        ),
      page: z
        .number()
        .int()
        .min(1)
        .max(MAX_PAGE)
        .optional()
        .describe('Page of results, from 1. Rewording beats paging.'),
      query: z
        .string()
        .min(2)
        .max(100)
        .describe(
          'What the photograph should show or feel like, in a few words — ' +
            '"weathered ochre plaster", "morning light on water".',
        ),
    },
  },
  {
    description:
      'Store an Unsplash photograph the person chose from `findStockPhoto` ' +
      'in the Media library, and return its id for use as a post’s ' +
      'featuredImage via `updatePosts`. Takes only the photo’s `id` and ' +
      'your alt text: the credit, its link to the photographer and where the ' +
      'file came from are written from Unsplash’s own record, and the image ' +
      'is marked as a photograph rather than generated. Importing the same ' +
      'photograph again returns the copy already stored. ' +
      STOCK_RULE,
    handler: async (args: Record<string, unknown>, req: PayloadRequest) => {
      const { alt, caption, photoId } = args as {
        alt: string
        caption?: string
        photoId: string
      }

      const unsplash = unsplashClient()
      if (!unsplash) throw new StockPhotoError(NOT_CONFIGURED)

      const id = photoId.trim()
      if (!isPhotoId(id)) {
        throw new StockPhotoError(
          'That is not an Unsplash photo id. Use an `id` returned by ' +
            '`findStockPhoto`.',
        )
      }

      // An earlier import of the same photograph is returned rather than
      // stored twice. Nothing is downloaded, so nothing is reported to
      // Unsplash and no budget is spent. Trashed copies are not matched: a
      // photograph somebody threw away can be brought back as a new one.
      const sourceURL = photoPageURL(id)
      const { docs } = await req.payload.find({
        collection: 'media',
        depth: 0,
        limit: 1,
        overrideAccess: false,
        req,
        user: req.user,
        where: { sourceURL: { equals: sourceURL } },
      })
      const existing = docs[0] as unknown as Record<string, unknown> | undefined
      if (existing) {
        logMcpEvent(
          mcpStockLogEntry({
            downloadTracked: null,
            mediaId: existing.id,
            photoId: id,
            reused: true,
            source: 'unsplash',
            userId: req.user?.id,
          }),
        )
        return text({
          alt: existing.alt,
          credit: existing.credit ?? null,
          creditURL: existing.creditURL ?? null,
          id: existing.id,
          reused: true,
          sourceURL,
          url: existing.url,
        })
      }

      spendStockBudget(req)

      let photo
      let fetched
      try {
        // The canonical record, not anything that came back through the
        // agent — attribution and the image address are derived from this.
        photo = await unsplash.photo(id)
        fetched = await fetchPublicBytes(
          imageAddress(photo),
          MAX_AGENT_UPLOAD_BYTES,
        )
      } catch (error) {
        throw stockFailure(error, 'The photograph could not be downloaded.')
      }

      const attribution = attributionFor(photo)
      // Read from the bytes, exactly as on the other two upload paths.
      const file = vetImageBytes(
        fetched.bytes,
        `unsplash-${photo.photographer.name}-${photo.id}`,
      )

      const created = await req.payload.create({
        collection: 'media',
        data: {
          // Not a parameter: this path only ever carries a photograph, and
          // the default elsewhere is the wrong answer for one.
          aiGenerated: false,
          alt,
          caption,
          credit: attribution.credit,
          creditURL: attribution.creditURL,
          sourceURL: attribution.sourceURL,
        },
        file,
        overrideAccess: false,
        req,
        user: req.user as TypedUser,
      })

      // After the create, so a failed upload never counts as a download.
      // A report that fails does not undo the import; it is logged at warn.
      const downloadTracked = await unsplash.trackDownload(photo)

      logMcpEvent(
        mcpStockLogEntry({
          downloadTracked,
          mediaId: created.id,
          photoId: id,
          reused: false,
          source: 'unsplash',
          userId: req.user?.id,
        }),
      )

      return text({
        aiGenerated: false,
        alt: created.alt,
        credit: attribution.credit,
        creditURL: attribution.creditURL,
        downloadTracked,
        id: created.id,
        mimetype: file.mimetype,
        reused: false,
        sizeBytes: file.size,
        sourceURL: attribution.sourceURL,
        url: created.url,
      })
    },
    name: 'importStockPhoto',
    parameters: {
      alt: z
        .string()
        .min(1)
        .describe(
          'Alternative text describing what the photograph shows. Required. ' +
            'The candidate’s `description` is machine-written; use it as a ' +
            'starting point, not as the answer.',
        ),
      caption: z
        .string()
        .optional()
        .describe(
          'Caption shown under the image, when it has one. The credit is ' +
            'added separately.',
        ),
      photoId: z
        .string()
        .min(1)
        .max(32)
        .describe('The `id` of the candidate the person chose.'),
    },
  },
]
