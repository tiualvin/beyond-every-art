// The section list the article rail shows, derived from a body.
//
// The anchors have to be the *same* strings the body renders, or every link in
// the list points at nothing. That is the whole difficulty here, and it is why
// this file is more careful than a heading walk looks like it needs to be.
//
// For rich text the anchors come from `createAnchorAllocator`, which is
// stateful: it hands out `method`, then `method-2` for a repeat. The renderer
// creates one allocator per document (see `blocks/registry.tsx`) and shares it
// between the body's own headings and any block that emits one — a FAQ's
// questions, a media-and-text heading, a key-takeaways title. So an extractor
// that walked only headings would fall out of step with the renderer the
// moment a block appeared above one, and hand back an anchor that is off by a
// suffix.
//
// Rather than reimplement every block's allocation — a coupling that would
// break silently the first time a new block anchored something — the walk
// stops at the first block node. Headings before it are exact, because neither
// the renderer nor this file has allocated anything else by then. An article
// whose first block sits above its headings therefore gets no contents list,
// which is the correct failure: an absent list is a missing convenience, a
// wrong one is a broken link.
//
// Preserved Ghost markup has no allocator involved at all — the ids are in the
// HTML or they are not — so that branch reads them straight out and skips any
// heading that never had one.

import type { ArticleBody, BodyNode } from './body'
import { createAnchorAllocator, headingText } from './headings'

/** One section of an article, as the rail lists it. */
export type TocEntry = {
  /** The `id` on the rendered heading. */
  id: string
  text: string
}

/** Headings inside `<h2>` only: an h3 list in a 300px rail is a wall. */
const HEADING_TAG = 'h2'

export function extractHeadings(body: ArticleBody): TocEntry[] {
  if (body.kind === 'lexical') return fromLexical(body.content.root?.children)
  if (body.kind === 'html') return fromHtml(body.html)
  return []
}

function fromLexical(children: BodyNode[] | undefined): TocEntry[] {
  const allocate = createAnchorAllocator()
  const entries: TocEntry[] = []

  for (const node of children ?? []) {
    // See the note at the top: past a block, this file can no longer promise
    // its anchors match the ones the renderer will hand out.
    if (node.type === 'block') break
    if (node.type !== 'heading') continue

    const text = headingText(node)
    // Allocated for every heading level, not just the ones listed, because the
    // renderer allocates for all of them and the counters have to agree.
    const id = allocate(text)
    if (node.tag === HEADING_TAG && text) entries.push({ id, text })
  }

  return entries
}

const HTML_HEADING = /<h2\b([^>]*)>([\s\S]*?)<\/h2>/gi
const HTML_ID = /\bid\s*=\s*["']([^"']+)["']/i

function fromHtml(html: string): TocEntry[] {
  const entries: TocEntry[] = []

  for (const match of html.matchAll(HTML_HEADING)) {
    const id = HTML_ID.exec(match[1])?.[1]
    // A heading with no id cannot be linked to, and inventing one here would
    // name a place the markup does not have.
    if (!id) continue
    const text = stripMarkup(match[2])
    if (text) entries.push({ id, text })
  }

  return entries
}

/** The readable text of a heading's inner markup. */
function stripMarkup(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The entities a heading realistically carries.
 *
 * Deliberately short: this text is rendered as a React child, so anything left
 * undecoded shows as itself rather than becoming markup. The list covers what
 * Ghost's own renderer emits.
 */
const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
  '&rsquo;': '’',
  '&lsquo;': '‘',
  '&ldquo;': '“',
  '&rdquo;': '”',
  '&mdash;': '—',
  '&ndash;': '–',
}

function decodeEntities(text: string): string {
  return text.replace(
    /&(?:amp|lt|gt|quot|#39|apos|nbsp|rsquo|lsquo|ldquo|rdquo|mdash|ndash);/g,
    (entity) => ENTITIES[entity] ?? entity,
  )
}
