// Reading and editing a migrated article's Ghost HTML, a few characters at a time.
//
// A migrated article renders from `legacyHTML` while its rich-text body is
// empty, and the page puts that string into a `<div>` with
// `dangerouslySetInnerHTML` — so whatever lands in the field is markup the
// browser runs, not text. The two tools built on this module let an agent make
// the edits a migrated archive actually needs (a phrase wrapped in a link to a
// newer article, a sentence corrected) and no other kind.
//
// Everything here is decided on a parse tree, never by matching markup with a
// regular expression. The parser is parse5, which implements the WHATWG
// tree-construction algorithm: the one the browser runs when React sets
// `innerHTML`. So what this module believes an edit means and what the page
// does with it are the same thing, which is the property a check on markup
// that will be injected raw cannot do without. (DOMPurify, which the admin's
// code editor pulls in, needs a DOM and strips what it dislikes rather than
// saying so; happy-dom, which Lexical pulls in, tokenises with a regular
// expression.)
//
// An edit is judged by what it does to the parse of the whole body, in place:
//
// - markup it adds — any start tag or comment the edit touches that is not
//   copied verbatim from its own `find` — must be on a short allowlist;
// - it may not drop an image, figure, embed or block element its `find` held;
// - it may not leave anything for the browser to repair. Parse5 reports
//   syntax errors, but tree construction repairs silently — a stray `</em>` is
//   dropped without a word, a `<p>` closed twice gains an empty paragraph —
//   so the repairs are read off the tree instead: elements nobody wrote,
//   elements nobody closed, source the tree does not account for, and content
//   the parser moved. A body is compared with itself before the edit, because
//   Ghost's HTML is not guaranteed clean and an edit should not be refused for
//   a fault it did not make.

import {
  html as spec,
  parseFragment,
  type DefaultTreeAdapterTypes,
} from 'parse5'

import { siteHosts } from '../publications/links'
import { getSiteUrl } from '../seo/site'

type ChildNode = DefaultTreeAdapterTypes.ChildNode
type Element = DefaultTreeAdapterTypes.Element
type ParentNode = DefaultTreeAdapterTypes.ParentNode

/** How the page puts a migrated body on screen: `innerHTML` on a `<div>`. */
const CONTEXT = parseFragment('<div></div>').childNodes[0] as Element

type Span = { start: number; end: number }

/** Elements with no end tag, by definition rather than by omission. */
const VOID = new Set([
  'area',
  'base',
  'basefont',
  'bgsound',
  'br',
  'col',
  'embed',
  'frame',
  'hr',
  'img',
  'input',
  'keygen',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

/**
 * Elements whose contents are not markup: script, style, and their kin.
 *
 * Text inside one is code or data rather than prose, so an edit that reaches
 * into it is refused whatever it says — a phrase in a Ghost embed's script is
 * not a phrase.
 */
const RAW_TEXT = new Set([
  'iframe',
  'noembed',
  'noframes',
  'noscript',
  'plaintext',
  'script',
  'style',
  'template',
  'textarea',
  'title',
  'xmp',
])

/** Never read as part of the article's text. */
const NOT_PROSE = new Set(['script', 'style', 'template'])

/**
 * Where text stops running on, for matching. A query never matches across
 * one without the space a reader would see there.
 */
const BLOCK = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'br',
  'dd',
  'details',
  'div',
  'dl',
  'dt',
  'figcaption',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'summary',
  'table',
  'td',
  'th',
  'tr',
  'ul',
])

/**
 * What a `find` may not lose: pictures, embeds, and the structure of the page.
 *
 * Inline formatting is not here, so removing a link or an emphasis is an
 * ordinary edit. Anything here that a `find` holds must come back verbatim in
 * its `replace`.
 */
const KEPT = new Set([
  ...[...BLOCK].filter((tag) => tag !== 'br'),
  'audio',
  'canvas',
  'caption',
  'embed',
  'iframe',
  'img',
  'math',
  'object',
  'picture',
  'script',
  'source',
  'style',
  'svg',
  'tbody',
  'tfoot',
  'thead',
  'track',
  'video',
])

/** The only markup an edit may add. */
const ADDABLE = new Set(['a', 'b', 'em', 'i', 'strong'])

/** Refused by name, because "not on the allowlist" undersells it. */
const NEVER = new Set(['embed', 'iframe', 'object', 'script', 'style'])

/** `rel` values a link may carry. All of them only take something away. */
const REL_TOKENS = new Set([
  'nofollow',
  'noopener',
  'noreferrer',
  'sponsored',
  'ugc',
])

const HEADING = /^h[1-6]$/

type ParsedElement = {
  tag: string
  html: boolean
  attrs: Array<{ name: string; value: string }>
  /** Null when the parser made the element up. */
  startTag: Span | null
  endTag: Span | null
  /** The whole element, start tag to end tag. */
  outer: Span | null
  /** Between the tags: what a raw-text element holds. */
  inner: Span | null
}

/** Something the browser would have to fix, and where. */
type Repair = { at: number; what: string }

type Parsed = {
  elements: ParsedElement[]
  comments: Span[]
  headings: Array<{ at: number; text: string }>
  /** The article's text, as a reader sees it, each character traced to its source. */
  prose: Array<{ char: string } & Span>
  repairs: Repair[]
}

const span = (location: { startOffset: number; endOffset: number }): Span => ({
  start: location.startOffset,
  end: location.endOffset,
})

const isElement = (node: ChildNode | ParentNode): node is Element =>
  'tagName' in node

/** A character reference at the start of the string, as far as it could reach. */
const REFERENCE = /^&(?:#[xX][0-9a-fA-F]+;?|#[0-9]+;?|[A-Za-z][A-Za-z0-9]*;?)/

/**
 * Traces each character of a text node back to the source it was read from.
 *
 * Parse5 gives a text node its decoded value and the span of source it came
 * from, and the two differ wherever a character reference was decoded, a line
 * ending normalised, or a tag dropped between two runs of text — `a</em>b` is
 * one text node reading "ab". Decoding is done by the parser itself, one
 * reference at a time, so `&copy` and `&amp;` mean here exactly what they mean
 * on the page.
 *
 * Returns the tags the parser dropped from inside the node, each with where
 * it was, or null when the
 * source cannot be walked character by character, in which case every
 * character is traced to the whole node: a match there is still found, and
 * its stored form is simply wider than the words.
 */
function traceText(
  source: string,
  where: Span,
  value: string,
  decode: (reference: string) => string,
  emit: (char: string, at: Span) => void,
): Repair[] | null {
  const dropped: Repair[] = []
  const traced: Array<{ char: string } & Span> = []
  let i = where.start
  let j = 0

  while (i < where.end) {
    const c = source[i]

    if (c === '&') {
      const reference = REFERENCE.exec(source.slice(i, where.end))?.[0]
      if (reference) {
        const decoded = decode(reference)
        if (decoded !== reference && value.startsWith(decoded, j)) {
          for (const char of decoded.split(''))
            traced.push({ char, start: i, end: i + reference.length })
          i += reference.length
          j += decoded.length
          continue
        }
      }
    }

    if (c === '\r' && value[j] === '\n') {
      const width = source[i + 1] === '\n' ? 2 : 1
      traced.push({ char: '\n', start: i, end: i + width })
      i += width
      j += 1
      continue
    }

    if (c === value[j]) {
      traced.push({ char: c, start: i, end: i + 1 })
      i += 1
      j += 1
      continue
    }

    if (c === '<') {
      const close = source.indexOf('>', i)
      if (close !== -1 && close < where.end) {
        dropped.push({ at: i, what: `ignored:${source.slice(i, close + 1)}` })
        i = close + 1
        continue
      }
    }

    // Not walkable. Trace everything to the node as a whole.
    for (const char of value.split('')) emit(char, where)
    return null
  }

  if (j !== value.length) {
    for (const char of value.split('')) emit(char, where)
    return null
  }

  for (const { char, start, end } of traced) emit(char, { start, end })
  return dropped
}

/** The text an element holds, as one line. */
function textOf(node: ParentNode): string {
  let result = ''
  for (const child of node.childNodes) {
    if (child.nodeName === '#text') result += (child as { value: string }).value
    else if (isElement(child) && !NOT_PROSE.has(child.tagName)) {
      result += textOf(child)
    }
  }
  return result.replace(/\s+/g, ' ').trim()
}

/** A body parsed the way the page parses it, with everything this module asks of it. */
function parseBody(source: string): Parsed {
  const repairs: Repair[] = []
  const fragment = parseFragment(CONTEXT, source, {
    sourceCodeLocationInfo: true,
    onParseError: (error) =>
      repairs.push({ at: error.startOffset, what: `syntax:${error.code}` }),
  })

  const elements: ParsedElement[] = []
  const comments: Span[] = []
  const headings: Parsed['headings'] = []
  const prose: Parsed['prose'] = []
  const covered = new Uint8Array(source.length)
  const references = new Map<string, string>()
  const decode = (reference: string): string => {
    let decoded = references.get(reference)
    if (decoded === undefined) {
      const node = parseFragment(CONTEXT, reference, {}).childNodes[0]
      decoded = node && 'value' in node ? node.value : reference
      references.set(reference, decoded)
    }
    return decoded
  }
  const brk = (at: number) => prose.push({ char: '\n', start: at, end: at })

  // Each node's place in the source, in tree order. Anything the parser moved
  // — text foster-parented out of a table, say — arrives out of sequence.
  let last = -1
  const inSequence = (at: number) => {
    if (at < last) repairs.push({ at, what: 'moved' })
    last = Math.max(last, at)
  }
  // How far into the source the tree has been read. An element the parser
  // made up has no source of its own; it was made while reading what follows
  // this, so this is where it is reported.
  let reach = 0
  const read = (where: Span) => {
    covered.fill(1, where.start, where.end)
    reach = Math.max(reach, where.end)
  }

  const visit = (parent: ParentNode, readable: boolean) => {
    for (const node of parent.childNodes) {
      if (node.nodeName === '#text') {
        const location = node.sourceCodeLocation
        const value = (node as { value: string }).value
        if (!location) {
          repairs.push({ at: reach, what: 'text:unsourced' })
          continue
        }
        const where = span(location)
        read(where)
        inSequence(where.start)
        const dropped = traceText(source, where, value, decode, (char, at) => {
          if (readable) prose.push({ char, ...at })
        })
        if (dropped === null) {
          // Untraceable, so a tag swallowed inside it cannot be told from a
          // literal `<`. Count the angle brackets the text lost instead.
          const lost =
            (source.slice(where.start, where.end).match(/</g)?.length ?? 0) -
            (value.match(/</g)?.length ?? 0)
          if (lost > 0) repairs.push({ at: where.start, what: 'ignored:<…>' })
        } else {
          repairs.push(...dropped)
        }
        continue
      }

      if (node.nodeName === '#comment') {
        const location = node.sourceCodeLocation
        if (!location) continue
        const where = span(location)
        read(where)
        inSequence(where.start)
        comments.push(where)
        continue
      }

      if (!isElement(node)) continue

      const tag = node.tagName
      const html = node.namespaceURI === spec.NS.HTML
      const location = node.sourceCodeLocation
      const startTag = location?.startTag ? span(location.startTag) : null
      const endTag = location?.endTag ? span(location.endTag) : null

      if (startTag) {
        read(startTag)
        inSequence(startTag.start)
      } else {
        // No tags at all, so it is not also reported as unclosed.
        repairs.push({ at: reach, what: `implied:<${tag}>` })
      }

      const selfClosed =
        !html && startTag !== null && source[startTag.end - 2] === '/'
      if (startTag && !endTag && !(html && VOID.has(tag)) && !selfClosed) {
        repairs.push({ at: startTag.start, what: `unclosed:<${tag}>` })
      }

      const element: ParsedElement = {
        tag,
        html,
        attrs: node.attrs.map(({ name, value }) => ({ name, value })),
        startTag,
        endTag,
        outer: location ? span(location) : null,
        inner: startTag
          ? {
              start: startTag.end,
              end: endTag?.start ?? location?.endOffset ?? startTag.end,
            }
          : null,
      }
      elements.push(element)

      if (html && HEADING.test(tag) && startTag) {
        headings.push({ at: startTag.start, text: textOf(node) })
      }

      const block = html && BLOCK.has(tag)
      if (block && readable && startTag) brk(startTag.start)
      const children =
        tag === 'template' && 'content' in node
          ? (node.content as ParentNode)
          : node
      visit(children, readable && !(html && NOT_PROSE.has(tag)))
      if (endTag) read(endTag)
      if (block && readable) brk(endTag?.end ?? location?.endOffset ?? reach)
    }
  }
  visit(fragment, true)

  // Source no node accounts for: a tag the parser read and threw away, like a
  // `</strong>` with nothing to close.
  for (let i = 0; i < source.length;) {
    if (covered[i]) {
      i += 1
      continue
    }
    let j = i
    while (j < source.length && !covered[j]) j += 1
    const ignored = source.slice(i, j).trim()
    if (ignored) repairs.push({ at: i, what: `ignored:${ignored}` })
    i = j
  }

  return { elements, comments, headings, prose, repairs }
}

// --- Reading ----------------------------------------------------------------

/** Characters a reader cannot see, skipped when matching. */
const INVISIBLE = /[­​-‍⁠﻿]/

/** Folded to what a person would type, one UTF-16 unit for one. */
function fold(char: string): string {
  if (/[‘’‚‛′]/.test(char)) return "'"
  if (/[“”„‟″]/.test(char)) return '"'
  if (/[‐-―−]/.test(char)) return '-'
  const lower = char.toLowerCase()
  return lower.length === 1 ? lower : char
}

type Folded = { text: string; starts: number[]; ends: number[] }

/**
 * Text folded for matching: references decoded, quotes and dashes straightened,
 * case ignored, and every run of whitespace — a non-breaking space, a line
 * break, the gap between two paragraphs — one space.
 */
function foldText(chars: Iterable<{ char: string } & Span>): Folded {
  let text = ''
  const starts: number[] = []
  const ends: number[] = []
  let gap: Span | null = null

  for (const { char, start, end } of chars) {
    if (/\s/.test(char)) {
      gap = gap ? { start: gap.start, end } : { start, end }
      continue
    }
    if (INVISIBLE.test(char)) continue
    if (gap && text) {
      text += ' '
      starts.push(gap.start)
      ends.push(gap.end)
    }
    gap = null
    text += fold(char)
    starts.push(start)
    ends.push(end)
  }

  return { text, starts, ends }
}

/** Every place `needle` starts in `haystack`, overlapping ones included. */
export function occurrencesOf(haystack: string, needle: string): number[] {
  const found: number[] = []
  if (!needle) return found
  for (
    let at = haystack.indexOf(needle);
    at !== -1 && found.length < MAX_COUNTED;
    at = haystack.indexOf(needle, at + 1)
  ) {
    found.push(at)
  }
  return found
}

/** Past this, "how many" stops mattering. */
const MAX_COUNTED = 1000

/** A slice that never starts or ends halfway through a surrogate pair. */
function slice(source: string, from: number, to: number): string {
  let start = Math.max(0, from)
  let end = Math.min(source.length, to)
  if (start > 0 && /[\udc00-\udfff]/.test(source[start] ?? '')) start -= 1
  if (end < source.length && /[\ud800-\udbff]/.test(source[end - 1] ?? '')) {
    end += 1
  }
  return source.slice(start, end)
}

export type LegacyMatch = {
  /** Which match of the query this is, counting from 1. */
  occurrence: number
  /** Where `html` starts in the stored body. */
  offset: number
  /** The nearest heading at or above the match, as a reader sees it. */
  heading: string | null
  /** The match exactly as stored: what to copy into `find`. */
  html: string
  before: string
  after: string
  /** How often `html` occurs in the stored body. One means it is a usable `find` as it stands. */
  storedOccurrences: number
}

/** The most matches one call returns. */
export const MAX_MATCHES = 20

/**
 * Finds text as a reader sees it and returns it as it is stored.
 *
 * The query is matched against the article's text — references decoded, quotes
 * and dashes folded, case and spacing ignored, and across inline markup, so
 * "Tyrian purple" finds `Tyrian&nbsp;<em>purple</em>` — but each match comes
 * back as the exact stored HTML it spans, because that is what an edit has to
 * name.
 */
export function findInLegacyHtml(
  source: string,
  query: string,
  { context }: { context: number },
): { total: number; matches: LegacyMatch[] } {
  const wanted = foldText(
    query.split('').map((char) => ({ char, start: 0, end: 0 })),
  ).text
  if (!wanted) throw new Error('`query` has no visible text to look for.')

  const parsed = parseBody(source)
  const body = foldText(parsed.prose)
  const matches: LegacyMatch[] = []
  let total = 0

  for (
    let at = body.text.indexOf(wanted);
    at !== -1;
    at = body.text.indexOf(wanted, at + wanted.length)
  ) {
    total += 1
    if (matches.length >= MAX_MATCHES) continue

    const start = body.starts[at]
    const end = body.ends[at + wanted.length - 1]
    const html = source.slice(start, end)
    const heading = parsed.headings.filter((entry) => entry.at <= start).pop()

    matches.push({
      occurrence: total,
      offset: start,
      heading: heading?.text ?? null,
      html,
      before: slice(source, start - context, start),
      after: slice(source, end, end + context),
      storedOccurrences: occurrencesOf(source, html).length,
    })
  }

  return { total, matches }
}

/**
 * One page of the stored body, cut where a tag is not.
 *
 * A page that ended halfway through `<a href="…` would hand a caller half a
 * tag to copy, so the cut moves back to the start of any tag it would split.
 * Only a single tag longer than the page itself is ever cut through.
 */
export function pageOfLegacyHtml(
  source: string,
  offset: number,
  limit: number,
): { html: string; offset: number; nextOffset: number | null } {
  const start = Math.min(Math.max(0, offset), source.length)
  let end = Math.min(source.length, start + limit)

  if (end < source.length) {
    const open = source.lastIndexOf('<', end - 1)
    const close = source.indexOf('>', open)
    if (open > start && (close === -1 || close >= end)) end = open
    if (/[\ud800-\udbff]/.test(source[end - 1] ?? '')) end -= 1
  }

  return {
    html: source.slice(start, end),
    offset: start,
    nextOffset: end < source.length ? end : null,
  }
}

// --- Editing ----------------------------------------------------------------

export type LegacyEdit = { find: string; replace: string }

/** A link an edit adds, and what kind of address it is. */
export type AddedLink = {
  edit: number
  href: string
} & (
  | { target: 'external' }
  | {
      target: 'site'
      /** The path, without its query or fragment. */
      path: string
      /** The article it names, or null when the path is not an article's. */
      slug: string | null
    }
)

export type PlannedEdit = {
  /** The edit's number in the call, counting from 1. */
  edit: number
  /** Where `find` was, in the stored body before any edit. */
  offset: number
  before: string
  after: string
}

export type LegacyPlan = {
  html: string
  edits: PlannedEdit[]
  links: AddedLink[]
}

/** Context either side of an edit in its before and after. */
const SNIPPET_CONTEXT = 60

/** The most of a `find` or `replace` a snippet repeats. */
const SNIPPET_BODY = 500

function abridge(value: string): string {
  if (value.length <= SNIPPET_BODY) return value
  const half = SNIPPET_BODY / 2
  return `${value.slice(0, half)}…(${value.length - SNIPPET_BODY} characters)…${value.slice(-half)}`
}

const quote = (value: string, max = 80): string =>
  JSON.stringify(value.length > max ? `${value.slice(0, max)}…` : value)

/**
 * What an `href` is, or why it may not be one.
 *
 * https in full, or a path from the site's root, and nothing else — the same
 * line `toCreditURL` and the publication link policy draw. The value checked
 * is the parser's decoded one, so `&#106;avascript:` is read as what it is.
 */
function classifyHref(
  value: string,
  siteUrl: string,
):
  | { refused: string }
  | { site: false }
  | { site: true; path: string; slug: string | null } {
  if (!value) return { refused: 'an empty href' }

  // A browser strips or rewrites all of these before reading a URL, which is
  // how `java\tscript:` and `/\evil.example` get past checks that did not.
  if (/[\u0000- \u007f-\u009f\\]/.test(value)) {
    return {
      refused: `an href with whitespace, a control character or a backslash in it (${quote(value)})`,
    }
  }

  // The browser is not the only thing that reads this HTML. The ad splitter in
  // `lib/ads/inline.ts` finds where a paragraph ends with a regular
  // expression, and would find it inside an href holding `</p>` — so
  // `href='/x/?</p><img/src=x/onerror=…>'`, harmless to a parser reading the
  // whole body, would start the next chunk with a live image. A URL needs none
  // of these characters unescaped; it percent-encodes them.
  const unsafe = /[^A-Za-z0-9\-._~:/?#[\]@!$&()*+,;=%]/.exec(value)
  if (unsafe) {
    return {
      refused: `an href with ${quote(unsafe[0])} in it (${quote(value)}); percent-encode it`,
    }
  }

  const hosts = siteHosts(siteUrl)
  // The site's own name, whatever this deployment is configured as: a link
  // written for the live site is still checked on a staging server.
  hosts.add('beyondeveryart.com')
  hosts.add('www.beyondeveryart.com')

  let url: URL
  if (value.startsWith('/')) {
    try {
      url = new URL(value, siteUrl)
    } catch {
      return { refused: `an href that does not parse (${quote(value)})` }
    }
    // `//evil.example` starts with a slash and goes somewhere else.
    if (url.origin !== new URL(siteUrl).origin) {
      return {
        refused: `a protocol-relative href (${quote(value)}); write https:// in full`,
      }
    }
  } else {
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value)?.[1]?.toLowerCase()
    if (scheme !== 'https') {
      return {
        refused: scheme
          ? `a ${scheme}: href (${quote(value)}); links must be https:// or a /path/ on this site`
          : `a relative href (${quote(value)}); write a path from the root, /like-this/, or https:// in full`,
      }
    }
    if (!/^https:\/\//i.test(value)) {
      return { refused: `an href without its // (${quote(value)})` }
    }
    try {
      url = new URL(value)
    } catch {
      return { refused: `an href that does not parse (${quote(value)})` }
    }
    // `https://www.beyondeveryart.com@evil.example/` goes to evil.example.
    if (url.username || url.password) {
      return { refused: `an href with credentials in it (${quote(value)})` }
    }
    if (!hosts.has(url.hostname.toLowerCase())) return { site: false }
  }

  const path = url.pathname
  const segment = /^\/([^/]+)\/?$/.exec(path)?.[1]
  let slug: string | null = null
  if (segment) {
    try {
      slug = decodeURIComponent(segment)
    } catch {
      slug = null
    }
  }
  return { site: true, path, slug }
}

/** Why a start tag an edit added may not be added, if it may not. */
function refusalsFor(element: ParsedElement, siteUrl: string): string[] {
  const { tag } = element
  if (!element.html) {
    return [`adds <${tag}> inside an SVG or MathML element`]
  }
  if (NEVER.has(tag)) return [`adds <${tag}>, which is never accepted`]
  if (!ADDABLE.has(tag)) {
    return [
      `adds <${tag}>; the markup an edit may add is <a href>, <em>, <strong>, <i> and <b>`,
    ]
  }

  const reasons: string[] = []
  for (const { name, value } of element.attrs) {
    if (name.startsWith('on')) {
      reasons.push(`adds an event handler (\`${name}\`) on <${tag}>`)
    } else if (name === 'style') {
      reasons.push(`adds a style attribute on <${tag}>`)
    } else if (tag === 'a' && name === 'href') {
      const href = classifyHref(value, siteUrl)
      if ('refused' in href) reasons.push(`adds ${href.refused}`)
    } else if (tag === 'a' && name === 'rel') {
      const unknown = value
        .toLowerCase()
        .split(/\s+/)
        .filter((token) => token && !REL_TOKENS.has(token))
      if (unknown.length) {
        reasons.push(
          `adds rel="${value}"; a link's rel may be ${[...REL_TOKENS].join(', ')}`,
        )
      }
    } else {
      reasons.push(
        tag === 'a'
          ? `adds \`${name}\` on <a>; a link may carry only href and rel`
          : `adds \`${name}\` on <${tag}>, which takes no attributes`,
      )
    }
  }
  if (tag === 'a' && !element.attrs.some((attr) => attr.name === 'href')) {
    reasons.push('adds an <a> without an href')
  }
  return reasons
}

/** A repair, as a sentence. */
function describeRepair(what: string): string {
  const [kind, ...rest] = what.split(':')
  const detail = rest.join(':')
  switch (kind) {
    case 'unclosed':
      return `leaves ${detail} unclosed`
    case 'implied':
      return `makes the browser insert a ${detail} that is not in the HTML`
    case 'ignored':
      return `leaves ${quote(detail)}, which the browser would throw away — a tag closing nothing, or one closed out of order`
    case 'moved':
      return 'leaves content the browser would move elsewhere, as it does with text loose inside a table'
    case 'syntax':
      return detail === 'invalid-first-character-of-tag-name'
        ? 'has a "<" that starts no tag; write &lt; for a literal one'
        : `has an HTML syntax error (${detail})`
    default:
      return `leaves markup the browser would repair (${what})`
  }
}

/**
 * Plans a set of edits, or refuses them all with every reason at once.
 *
 * Pure: it reads nothing and writes nothing. Whether a link's article is on the
 * site, and the save itself, are the tool's business; this decides only
 * whether the HTML that would result is HTML the tool may write.
 */
export function planLegacyEdits(
  source: string,
  edits: LegacyEdit[],
  siteUrl: string = getSiteUrl(),
): LegacyPlan {
  const problems: string[] = []

  // 1. Each `find` names exactly one place.
  const located = edits.map((edit, index) => {
    const number = index + 1
    if (!edit.find) {
      problems.push(`Edit ${number}: \`find\` is empty.`)
      return null
    }
    if (edit.find === edit.replace) {
      problems.push(`Edit ${number}: \`replace\` is the same as \`find\`.`)
      return null
    }
    const found = occurrencesOf(source, edit.find)
    if (found.length !== 1) {
      problems.push(
        found.length === 0
          ? `Edit ${number}: \`find\` ${quote(edit.find)} occurs 0 times in the stored HTML. It is matched exactly — references, quotes and tags included — so copy it from readLegacyHtml.`
          : `Edit ${number}: \`find\` ${quote(edit.find)} occurs ${found.length === MAX_COUNTED ? `${MAX_COUNTED}+` : found.length} times in the stored HTML; it has to name one place. Widen it with the HTML on either side.`,
      )
      return null
    }
    return { ...edit, number, at: found[0] }
  })
  if (problems.length) throw new Error(problems.join('\n'))

  const sorted = (located as NonNullable<(typeof located)[number]>[]).sort(
    (a, b) => a.at - b.at,
  )
  for (let k = 1; k < sorted.length; k += 1) {
    const [previous, next] = [sorted[k - 1], sorted[k]]
    if (next.at < previous.at + previous.find.length) {
      problems.push(
        `Edits ${previous.number} and ${next.number} overlap. Make them one edit.`,
      )
    }
  }
  if (problems.length) throw new Error(problems.join('\n'))

  // 2. The body after every edit, and where each one now sits in it.
  let html = ''
  let cursor = 0
  let shift = 0
  const placed = sorted.map((edit) => {
    html += source.slice(cursor, edit.at) + edit.replace
    const start = edit.at + shift
    shift += edit.replace.length - edit.find.length
    cursor = edit.at + edit.find.length
    return {
      ...edit,
      old: { start: edit.at, end: edit.at + edit.find.length },
      new: { start, end: start + edit.replace.length },
    }
  })
  html += source.slice(cursor)

  const before = parseBody(source)
  const after = parseBody(html)

  /** The edit that touched this span of the result, if one did. */
  const touching = (where: Span) =>
    placed.find(({ new: range }) =>
      range.start === range.end
        ? where.start < range.start && range.start < where.end
        : where.start < range.end && range.start < where.end,
    )
  const within = (where: Span, range: Span) =>
    range.start <= where.start && where.end <= range.end

  // 3. Nothing the browser would have to repair that it did not already.
  const outside = (repair: Repair) =>
    !placed.some(
      ({ new: range }) => range.start <= repair.at && repair.at <= range.end,
    )
  const existing = new Map<string, number>()
  for (const { what } of before.repairs) {
    existing.set(what, (existing.get(what) ?? 0) + 1)
  }
  // Repairs away from the edits are the likeliest to be the old ones, so they
  // are matched off first and whatever is left is the edits' doing.
  const ordered = [...after.repairs].sort(
    (a, b) => Number(outside(b)) - Number(outside(a)),
  )
  for (const repair of ordered) {
    const left = existing.get(repair.what) ?? 0
    if (left > 0) {
      existing.set(repair.what, left - 1)
      continue
    }
    // With one edit, whatever it left is its doing, wherever the parser
    // noticed it — an edit inside a link can leave the link unclosed.
    const by =
      placed.find(
        ({ new: range }) => range.start <= repair.at && repair.at <= range.end,
      ) ?? (placed.length === 1 ? placed[0] : undefined)
    problems.push(
      `${by ? `Edit ${by.number}` : 'The edits'}: the result ${describeRepair(repair.what)}.`,
    )
  }

  // 4. Markup the edits added, and markup they lost. Every start tag and
  //    comment inside a `find` may be reused once, verbatim, by its `replace`.
  const reusable = placed.map(({ old }) => {
    const tags = new Map<string, { tag: string; count: number }>()
    for (const element of before.elements) {
      if (!element.startTag || !within(element.startTag, old)) continue
      const raw = source.slice(element.startTag.start, element.startTag.end)
      const entry = tags.get(raw) ?? { tag: element.tag, count: 0 }
      entry.count += 1
      tags.set(raw, entry)
    }
    const notes = new Map<string, number>()
    for (const comment of before.comments) {
      if (!within(comment, old)) continue
      const raw = source.slice(comment.start, comment.end)
      notes.set(raw, (notes.get(raw) ?? 0) + 1)
    }
    return { tags, notes }
  })

  const links: AddedLink[] = []
  for (const element of after.elements) {
    if (!element.startTag) continue
    const edit = touching(element.startTag)
    if (!edit) continue
    const pool = reusable[placed.indexOf(edit)].tags
    const raw = html.slice(element.startTag.start, element.startTag.end)
    const kept = pool.get(raw)
    if (kept && kept.count > 0 && within(element.startTag, edit.new)) {
      kept.count -= 1
      continue
    }

    const reasons = refusalsFor(element, siteUrl)
    for (const reason of reasons) {
      problems.push(`Edit ${edit.number}: ${reason}.`)
    }
    if (reasons.length || element.tag !== 'a') continue

    const href = element.attrs.find((attr) => attr.name === 'href')!.value
    const kind = classifyHref(href, siteUrl)
    if ('refused' in kind) continue
    links.push(
      kind.site
        ? {
            edit: edit.number,
            href,
            target: 'site',
            path: kind.path,
            slug: kind.slug,
          }
        : { edit: edit.number, href, target: 'external' },
    )
  }

  for (const comment of after.comments) {
    const edit = touching(comment)
    if (!edit) continue
    const pool = reusable[placed.indexOf(edit)].notes
    const raw = html.slice(comment.start, comment.end)
    const left = pool.get(raw) ?? 0
    if (left > 0 && within(comment, edit.new)) {
      pool.set(raw, left - 1)
      continue
    }
    problems.push(
      `Edit ${edit.number}: adds an HTML comment (${quote(raw)}). Comments are never added; one already in \`find\` may be kept as it is.`,
    )
  }

  placed.forEach((edit, index) => {
    for (const [raw, { tag, count }] of reusable[index].tags) {
      if (count > 0 && KEPT.has(tag)) {
        problems.push(
          `Edit ${edit.number}: drops ${quote(raw)} from \`find\`. An image, figure, embed or block element in \`find\` has to appear in \`replace\` exactly as it was.`,
        )
      }
    }
  })

  // 5. Nothing inside a script, a style, or anything else that is not prose.
  for (const element of after.elements) {
    if (!element.html || !RAW_TEXT.has(element.tag) || !element.inner) continue
    const edit = touching(element.inner)
    const reachesIn =
      edit ??
      placed.find(
        ({ new: range }) =>
          range.start === range.end &&
          element.inner!.start <= range.start &&
          range.start <= element.inner!.end,
      )
    if (!reachesIn) continue
    // Moved whole and unchanged, as part of a larger `find`, is not an edit to it.
    const whole = element.outer
    if (
      whole &&
      within(whole, reachesIn.new) &&
      reachesIn.find.includes(html.slice(whole.start, whole.end))
    ) {
      continue
    }
    problems.push(
      `Edit ${reachesIn.number}: changes what is inside a <${element.tag}>, which is code or data rather than text.`,
    )
  }

  if (problems.length) throw new Error([...new Set(problems)].join('\n'))

  return {
    html,
    edits: placed
      .sort((a, b) => a.number - b.number)
      .map((edit) => ({
        edit: edit.number,
        offset: edit.old.start,
        before:
          slice(source, edit.old.start - SNIPPET_CONTEXT, edit.old.start) +
          abridge(edit.find) +
          slice(source, edit.old.end, edit.old.end + SNIPPET_CONTEXT),
        after:
          slice(html, edit.new.start - SNIPPET_CONTEXT, edit.new.start) +
          abridge(edit.replace) +
          slice(html, edit.new.end, edit.new.end + SNIPPET_CONTEXT),
      })),
    links,
  }
}
