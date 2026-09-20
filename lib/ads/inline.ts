// Where the in-article units go, and how many of them there are.
//
// `docs/ADVERTISING.md` §8 planned one unit at a fixed position — "after the
// 5th body block" — which is the right shape for a 900-word post and the wrong
// shape for this archive. Measured over the 14 published articles: a mean of
// 4,800 words, a maximum of 7,899, and at the reading measure that is 27,000px
// of scrolling. One unit in thirty screens is not a placement, it is a token.
//
// So the count follows the length. The reader who stays for a 30-minute piece
// is worth more than the reader who leaves after two screens, and a fixed
// count cannot express that.
//
// Pure, and separate from anything that renders, because the thing that is
// easy to get wrong here is arithmetic about where a boundary falls — not JSX.

import type { BodyNode, BodyRoot } from '@/lib/content/body'

/** Words of body before the first unit. About a screen and a half. */
export const INLINE_FIRST_WORDS = 400

/**
 * Words between units after the first.
 *
 * Measured rather than chosen: at the 704px measure this body copy runs about
 * 3.3px per word, so a 900px desktop screen holds ~270 words and an 844px
 * phone screen ~128. 800 words is therefore ~3 desktop screens and ~6 phone
 * screens between units, which keeps §8's "two units can share a screen, and
 * only two" true with the sticky rail unit as the second — on both devices,
 * with the desktop the binding case.
 *
 * Those per-screen figures came from measuring the live articles, and the part
 * of them that can go stale is the type: shrink `.prose` and every gap here
 * shrinks with it. `tests/design/article-layout.test.ts` recomputes the gap
 * from the stylesheet for exactly that reason, so a change to the measure, the
 * size or the leading that would put a third unit on a screen fails there
 * rather than shipping.
 */
export const INLINE_GAP_WORDS = 800

/**
 * The most units one article may carry, however long it is.
 *
 * Six covers the mean article exactly and caps the 7,899-word outlier, which
 * would otherwise take ten. The cap is the part that matters for this archive,
 * because most of it is long enough to reach one — and the returns past here
 * are thin in a way the arithmetic hides: most readers never reach unit six,
 * so it earns a fraction of what unit one does while costing the same in how
 * the page reads. `../../PRODUCT.md` is the other half of that argument.
 */
export const INLINE_MAX = 6

/**
 * What a top-level piece of a body is, for the purpose of putting an ad after
 * it. Only three kinds matter, and two of them are rules about *not* breaking.
 */
export type InlineBlockKind = 'heading' | 'figure' | 'text'

export type InlineBlock = {
  /** Words this block contributes to the running total. */
  words: number
  kind: InlineBlockKind
}

/**
 * Indices of the blocks an in-article unit goes *after*.
 *
 * The rule is a running word count: the first unit once `INLINE_FIRST_WORDS`
 * have been read, then one every `INLINE_GAP_WORDS`, stopping at `INLINE_MAX`.
 *
 * Two boundaries are never used, and both come from §8:
 *
 * - **After a heading.** A heading belongs to the paragraph beneath it, and a
 *   unit between them orphans the heading at the bottom of a screen.
 * - **After a figure.** The text under a figure often reads as its caption
 *   whether or not it is marked up as one — that is ordinary in migrated Ghost
 *   bodies — so a unit there splits a picture from its explanation.
 *
 * When a boundary is refused the unit is not lost, it waits: the next legal
 * boundary takes it. That keeps the count right on figure-heavy articles
 * instead of quietly dropping units where the archive is densest.
 *
 * The last block never takes one either. A unit at the very end of the body is
 * `article-end` with extra steps, and that placement already exists.
 */
export function planInlineBreaks(blocks: InlineBlock[]): number[] {
  const breaks: number[] = []
  let words = 0
  let due = INLINE_FIRST_WORDS

  for (const [index, block] of blocks.entries()) {
    words += block.words

    if (breaks.length >= INLINE_MAX) break
    if (words < due) continue
    // Nothing after the last block; that is `article-end`'s job.
    if (index === blocks.length - 1) break
    if (block.kind === 'heading' || block.kind === 'figure') continue

    breaks.push(index)
    // From the words read so far, not from the threshold: a unit deferred past
    // a run of figures would otherwise bunch up against the one after it.
    due = words + INLINE_GAP_WORDS
  }

  return breaks
}

/** Tags that are a picture, or wrap one, for the never-split rule above. */
const FIGURE_TAGS = new Set([
  'figure',
  'img',
  'picture',
  'video',
  'iframe',
  'blockquote',
])

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

/** Elements with no closing tag, which the scanner must not look for one of. */
const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
])

export type HtmlBlock = InlineBlock & { html: string }

export function classifyTag(tag: string): InlineBlockKind {
  if (HEADING_TAGS.has(tag)) return 'heading'
  if (FIGURE_TAGS.has(tag)) return 'figure'
  return 'text'
}

/** Words in a fragment of markup, tags removed. */
export function countWords(html: string): number {
  return html
    .replace(/<[^>]*>/g, ' ')
    .split(/\s+/)
    .filter((word) => /[a-z0-9]/i.test(word)).length
}

/**
 * A body's top-level elements, in order, each with its own markup.
 *
 * Written by hand rather than parsed with a DOM, because this runs on the
 * server for every post render and the only question being asked is where the
 * top-level boundaries are. Depth is counted per tag name, which is sound for
 * the elements a body is made of — a `<p>` cannot contain a `<p>`, and the
 * HTML parser that produced this markup already closed any that tried.
 *
 * Anything it cannot make sense of comes back as a single block, which is the
 * safe failure: no boundaries found means no units inserted, rather than a
 * split through the middle of a tag.
 */
export function topLevelBlocks(html: string): HtmlBlock[] {
  const blocks: HtmlBlock[] = []
  const tagAt = /<([a-z][a-z0-9]*)\b/iy
  let i = 0

  while (i < html.length) {
    const next = html.indexOf('<', i)

    // Trailing text with no element after it.
    if (next === -1) {
      const rest = html.slice(i)
      if (rest.trim()) {
        blocks.push({ html: rest, words: countWords(rest), kind: 'text' })
      }
      break
    }

    // Loose text between elements belongs to whatever follows it, so that a
    // split never lands between a stray word and its paragraph.
    const lead = html.slice(i, next)

    if (html.startsWith('<!--', next)) {
      const close = html.indexOf('-->', next)
      if (close === -1) break
      i = close + 3
      continue
    }

    tagAt.lastIndex = next
    const open = tagAt.exec(html)
    if (!open) {
      // A `<` that starts no tag. Treat the remainder as one block rather than
      // guess at it.
      const rest = html.slice(i)
      blocks.push({ html: rest, words: countWords(rest), kind: 'text' })
      break
    }

    const tag = open[1].toLowerCase()
    const openEnd = html.indexOf('>', next)
    if (openEnd === -1) break

    let end: number
    if (VOID_TAGS.has(tag) || html[openEnd - 1] === '/') {
      end = openEnd + 1
    } else {
      // Matching close, counting nested opens of the same name.
      const scan = new RegExp(`</?${tag}\\b`, 'gi')
      scan.lastIndex = openEnd + 1
      let depth = 1
      let match: RegExpExecArray | null
      let close = -1
      while ((match = scan.exec(html))) {
        depth += match[0][1] === '/' ? -1 : 1
        if (depth === 0) {
          close = html.indexOf('>', match.index)
          break
        }
      }
      if (close === -1) {
        const rest = html.slice(i)
        blocks.push({ html: rest, words: countWords(rest), kind: 'text' })
        break
      }
      end = close + 1
    }

    const markup = lead + html.slice(next, end)
    blocks.push({
      html: markup,
      words: countWords(markup),
      kind: classifyTag(tag),
    })
    i = end
  }

  return blocks
}

/**
 * A body split into the chunks an ad goes between.
 *
 * One chunk means no units: either the body is too short, or every legal
 * boundary was refused. Callers render chunk zero and then a unit before each
 * chunk after it.
 */
export function splitHtmlForAds(html: string): string[] {
  const blocks = topLevelBlocks(html)
  const breaks = planInlineBreaks(blocks)
  if (breaks.length === 0) return [html]

  const chunks: string[] = []
  let from = 0
  for (const at of breaks) {
    chunks.push(
      blocks
        .slice(from, at + 1)
        .map((block) => block.html)
        .join(''),
    )
    from = at + 1
  }
  chunks.push(
    blocks
      .slice(from)
      .map((block) => block.html)
      .join(''),
  )

  return chunks
}

// --- Lexical bodies --------------------------------------------------------
//
// The easier of the two, and worth saying why: `RichText` renders its children
// straight into whatever parent it is given, so several of them inside one
// `.prose` produce exactly the children one of them would have. No wrapper, so
// none of `.prose`'s direct-child rules — the justification, the rhythm, the
// drop cap — can tell the difference. The HTML branch has to work for that,
// because `dangerouslySetInnerHTML` needs an element to hang on.

/** The words a node and its descendants contribute. */
function nodeWords(node: BodyNode): number {
  const own = node.text ? countWords(node.text) : 0
  return (node.children ?? []).reduce(
    (total, child) => total + nodeWords(child),
    own,
  )
}

/**
 * What kind of thing a top-level Lexical node is, for the never-split rules.
 *
 * Blocks that are pictures count as figures for the same reason `<figure>`
 * does in markup: the paragraph after a gallery usually reads as its caption,
 * and a unit between them splits a picture from its explanation.
 */
function nodeKind(node: BodyNode): InlineBlockKind {
  if (node.type === 'heading') return 'heading'
  if (node.type === 'upload' || node.type === 'horizontalrule') return 'figure'

  const block = node.fields?.blockType
  if (
    block === 'gallery' ||
    block === 'media-text' ||
    block === 'pull-quote' ||
    block === 'embed'
  ) {
    return 'figure'
  }

  return 'text'
}

/**
 * A rich-text body split into the parts an ad goes between.
 *
 * One part means no units. Each part is a whole `BodyRoot` so it can be handed
 * to `RichText` unchanged — the root's own properties are carried across, since
 * a converter may read them.
 */
export function splitLexicalForAds(body: BodyRoot): BodyRoot[] {
  const nodes = body.root.children ?? []
  const breaks = planInlineBreaks(
    nodes.map((node) => ({ words: nodeWords(node), kind: nodeKind(node) })),
  )
  if (breaks.length === 0) return [body]

  const parts: BodyRoot[] = []
  let from = 0
  for (const at of [...breaks, nodes.length - 1]) {
    parts.push({ root: { ...body.root, children: nodes.slice(from, at + 1) } })
    from = at + 1
  }

  return parts.filter((part) => (part.root.children ?? []).length > 0)
}
