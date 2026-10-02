// Inline Markdown for a line of text that is not rich text.
//
// A comparison table's cells are plain text fields, one short string each, and
// that is deliberate: a rich-text editor per cell would put up to a hundred
// and fifty editors on one admin screen, and a text field cannot hold block
// content no matter what is typed into it. What a cell does need is the
// inline part of writing — a species in italics, a term in bold, a link to a
// source — so a cell is read as inline Markdown: `*italic*`, `_italic_`,
// `**bold**`, `` `code` ``, `[text](url)`, and a backslash to escape any of
// them. Nothing else. There is no HTML, and a heading or a list marker is
// just the characters typed.
//
// The parser returns nodes rather than HTML, so the renderer builds elements
// and nothing here is ever handed to `dangerouslySetInnerHTML`. It is
// deliberately conservative about what counts as markup, because a cell that
// already says `2 * 3 * 4` or `snake_case` was written as text: a delimiter
// formats only when it opens and closes a run the way Markdown's own flanking
// rules would have it, and an underscore inside a word is always a letter.
//
// A link goes through `safeHref`, the same gate the button block uses: a path
// on this site or an `https:` URL, and nothing else. A link to anywhere else
// keeps its text and loses its target, so the failure is plain words rather
// than a live `javascript:` anchor.

import { safeHref } from './embed'

export type InlineNode =
  | { type: 'text'; text: string }
  | { type: 'em'; children: InlineNode[] }
  | { type: 'strong'; children: InlineNode[] }
  | { type: 'code'; text: string }
  | { type: 'link'; href: string; children: InlineNode[] }

const ESCAPABLE = new Set('\\`*_[]()!#+-.|'.split(''))

const isWordChar = (char: string | undefined) =>
  char !== undefined && /[\p{L}\p{N}]/u.test(char)

const isSpace = (char: string | undefined) =>
  char === undefined || /\s/.test(char)

/**
 * Where a run opened by `delimiter` at `open` closes, or -1 if it does not.
 *
 * The run must not begin or end with whitespace, and must not be empty. For
 * an underscore the delimiters must also sit at word edges, so `snake_case`
 * and `a_b_c` stay words.
 */
function findClose(source: string, open: number, delimiter: string): number {
  const start = open + delimiter.length
  if (isSpace(source[start])) return -1
  if (delimiter === '_' && isWordChar(source[open - 1])) return -1

  for (let at = start + 1; at <= source.length - delimiter.length; at += 1) {
    if (source[at] === '\\') {
      at += 1
      continue
    }
    if (source.startsWith(delimiter, at)) {
      // `**` inside a `*` run is its own delimiter, not this one's close.
      if (delimiter === '*' && source[at + 1] === '*') {
        at += 1
        continue
      }
      // In `***`, bold closes on the last pair: the first `*` closes the
      // italics nested inside it, as in `**very *red***`.
      if (delimiter === '**' && source[at + 2] === '*') continue
      if (isSpace(source[at - 1])) continue
      if (delimiter === '_' && isWordChar(source[at + 1])) continue
      return at
    }
  }
  return -1
}

/** A `[label](url)` starting at `open`, or null if it is not one. */
function readLink(
  source: string,
  open: number,
): { label: string; url: string; end: number } | null {
  let at = open + 1
  while (at < source.length && source[at] !== ']') {
    if (source[at] === '\\') at += 1
    if (source[at] === '[') return null
    at += 1
  }
  if (source[at] !== ']' || source[at + 1] !== '(') return null

  // Balanced, so an address with parentheses in it — Wikipedia's
  // `Carmine_(pigment)` — is read whole rather than cut at its first `)`.
  let depth = 1
  let close = at + 2
  for (; close < source.length && depth > 0; close += 1) {
    if (source[close] === '(') depth += 1
    if (source[close] === ')') depth -= 1
  }
  if (depth !== 0) return null
  close -= 1

  return {
    label: source.slice(open + 1, at),
    url: source.slice(at + 2, close).trim(),
    end: close + 1,
  }
}

function merge(nodes: InlineNode[]): InlineNode[] {
  const out: InlineNode[] = []
  for (const node of nodes) {
    const last = out.at(-1)
    if (node.type === 'text' && last?.type === 'text') {
      last.text += node.text
    } else if (node.type !== 'text' || node.text) {
      out.push(node)
    }
  }
  return out
}

function parse(source: string, allowLinks: boolean): InlineNode[] {
  const nodes: InlineNode[] = []
  let text = ''
  const flush = () => {
    if (text) nodes.push({ type: 'text', text })
    text = ''
  }

  for (let at = 0; at < source.length; at += 1) {
    const char = source[at]

    if (char === '\\' && ESCAPABLE.has(source[at + 1])) {
      text += source[at + 1]
      at += 1
      continue
    }

    if (char === '`') {
      const close = source.indexOf('`', at + 1)
      if (close > at + 1) {
        flush()
        nodes.push({ type: 'code', text: source.slice(at + 1, close) })
        at = close
        continue
      }
    }

    if (char === '[' && allowLinks) {
      const link = readLink(source, at)
      if (link) {
        flush()
        const children = parse(link.label, false)
        const href = safeHref(link.url)
        if (href) nodes.push({ type: 'link', href, children })
        else nodes.push(...children)
        at = link.end - 1
        continue
      }
    }

    const delimiter = source.startsWith('**', at)
      ? '**'
      : char === '*' || char === '_'
        ? char
        : null
    if (delimiter) {
      const close = findClose(source, at, delimiter)
      if (close !== -1) {
        flush()
        nodes.push({
          type: delimiter === '**' ? 'strong' : 'em',
          children: parse(
            source.slice(at + delimiter.length, close),
            allowLinks,
          ),
        })
        at = close + delimiter.length - 1
        continue
      }
      // Not markup: the whole delimiter is text, so `**` never half-opens.
      text += delimiter
      at += delimiter.length - 1
      continue
    }

    text += char
  }

  flush()
  return merge(nodes)
}

/** A line of inline Markdown, as nodes. */
export function parseInlineMarkdown(
  source: string | null | undefined,
): InlineNode[] {
  return parse(source ?? '', true)
}

function plain(nodes: InlineNode[]): string {
  return nodes
    .map((node) =>
      node.type === 'text' || node.type === 'code'
        ? node.text
        : plain(node.children),
    )
    .join('')
}

/**
 * The words in a line of inline Markdown, for search and feeds. A link keeps
 * its text and drops its URL, the way the plain-text serializer treats links
 * everywhere else.
 */
export function inlineMarkdownToPlainText(
  source: string | null | undefined,
): string {
  return plain(parseInlineMarkdown(source))
}
