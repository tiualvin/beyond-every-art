// Keeping whole article bodies out of an agent's context.
//
// The plugin's generated `find` tools serialise every field of every document
// they return, and a migrated post carries its entire Ghost body in
// `legacyHTML`. A single unbounded `findPosts` therefore answers with tens of
// thousands of characters of markup that nobody asked for, and a handful of
// them fills the context window an agent has to do its actual work in.
//
// `overrideResponse` is the plugin's hook for this. It runs on the generated
// tools only: the custom tools in `tools.ts` build their own compact replies,
// and `readArticleMarkdown` returns a body because returning the body is its
// entire purpose.

import type { MCPPluginConfig } from '@payloadcms/plugin-mcp'

type CollectionOptions = NonNullable<
  NonNullable<MCPPluginConfig['collections']>['posts']
>
type OverrideResponse = NonNullable<CollectionOptions['overrideResponse']>
type Response = Parameters<OverrideResponse>[0]

/**
 * Fields replaced with a note saying what was there.
 *
 * Both hold an article body: `content` as Lexical editor state, `legacyHTML` as
 * the migrated Ghost markup a migrated post actually renders from. An agent
 * that wants either should ask `readArticleMarkdown`, which returns one of them
 * as Markdown and says plainly when the document renders from the other.
 */
const HEAVY_FIELDS: Record<string, string> = {
  content: 'rich-text body',
  legacyHTML: 'migrated Ghost HTML',
}

/** Serialised size of a value, which is what actually costs context. */
function weigh(value: unknown): number {
  return typeof value === 'string' ? value.length : JSON.stringify(value).length
}

/**
 * A copy of `doc` with heavy fields replaced, or null when it carried none.
 *
 * Null rather than an unchanged copy so the caller can tell "nothing to do"
 * from "done", and leave the plugin's own response completely untouched in the
 * first case — which is what a `select`ed query, or any collection without
 * these fields, produces.
 */
export function elideDocument(
  doc: Record<string, unknown>,
): Record<string, unknown> | null {
  let elided = false
  const result = { ...doc }

  for (const [name, description] of Object.entries(HEAVY_FIELDS)) {
    const value = doc[name]
    if (value === undefined || value === null || value === '') continue

    result[name] =
      `[elided by the MCP server: ${weigh(value)} characters of ${description}. ` +
      'Read it with `readArticleMarkdown`.]'
    elided = true
  }

  return elided ? result : null
}

/** The documents in whatever the plugin passed as its second argument. */
function documentsIn(payload: unknown): Record<string, unknown>[] {
  if (typeof payload !== 'object' || payload === null) return []

  const docs = (payload as { docs?: unknown }).docs
  if (Array.isArray(docs)) return docs as Record<string, unknown>[]

  // A single document, from `findByID`, `create`, or `update`. The error paths
  // pass `{}`, which has no `id` and so contributes nothing.
  return 'id' in payload ? [payload as Record<string, unknown>] : []
}

/** The plugin's own list header, rebuilt from the same paginated result. */
function listHeader(collection: string, payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null

  const { docs, page, totalDocs, totalPages } = payload as {
    docs?: unknown
    page?: unknown
    totalDocs?: unknown
    totalPages?: unknown
  }
  if (!Array.isArray(docs)) return null

  return (
    `Collection: "${collection}"\n` +
    `Total: ${totalDocs ?? docs.length} documents\n` +
    `Page: ${page ?? 1} of ${totalPages ?? 1}\n`
  )
}

/**
 * Rebuilds a generated tool's response with article bodies summarised.
 *
 * The response text arrives already serialised, so the elided version is built
 * from the documents rather than by editing the string: a rebuild is
 * deterministic, where a search-and-replace over the plugin's formatting would
 * fail silently the first time that formatting changed. When there is nothing
 * to elide the plugin's own response is returned untouched, so this narrows
 * responses and never reformats them for its own sake.
 */
export function elideArticleBodies(collection: string): OverrideResponse {
  return (response, doc) => {
    const documents = documentsIn(doc)
    if (!documents.length) return response

    const elided = documents.map(
      (document) => elideDocument(document) ?? document,
    )
    if (elided.every((document, index) => document === documents[index])) {
      return response
    }

    const header = listHeader(collection, doc)
    const text = header
      ? header +
        elided
          .map(
            (document) => `\n\`\`\`json\n${JSON.stringify(document)}\n\`\`\``,
          )
          .join('')
      : `Resource from collection "${collection}":\n${JSON.stringify(elided[0])}`

    return { content: [{ text, type: 'text' }] } satisfies Response
  }
}
