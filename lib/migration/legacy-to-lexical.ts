// A migrated article's Ghost HTML, rebuilt as the posts editor's own Lexical.
//
// Every migrated article renders from `legacyHTML` while its rich-text body is
// empty, and the module tools — FAQs, key facts, tables — refuse it, because a
// body holding only a module would replace the whole article. Converting the
// body into the editor is what lets those tools work on the pages that still
// earn most of the search traffic. This is the conversion, and only the
// conversion: it reads HTML and returns editor state plus everything it
// noticed. It writes nothing; `lib/mcp/convert-legacy.ts` checks the result
// and saves it, one article at a time, as a draft.
//
// **It refuses rather than approximates.** Anything the editor cannot hold
// exactly — an attribute that changes what a reader sees, an element with no
// node, an image with no Media document, a table with no caption — is a
// refusal with the reason and where it is, and a refusal anywhere means
// nothing is saved. Nothing is dropped quietly: what is left out on purpose
// (Ghost's card fences, `data-*` attributes, a bookmark's decorative favicon)
// is listed in `notes`.
//
// What it maps, measured on 24 Oct 2026 against the 113 migrated articles'
// stored HTML: paragraphs, headings h1–h4 with Ghost's ids, links, emphasis,
// nested bullet lists, rules, line breaks, sub- and superscript, and one raw
// HTML card holding a table. No article carries an image, a figure, a quote or
// a Ghost card in its body. The card mappings (image, gallery, bookmark,
// callout, toggle, embed) follow Ghost's documented card markup and are held
// by fixtures rather than by any article today.
//
// Heading ids are kept on the heading nodes (`$.anchor`, see
// `lib/content/headings.ts`), so the rendered ids equal the legacy ones
// whatever Ghost's slugging did and whatever the heading says later.

import { parseFragment, type DefaultTreeAdapterTypes } from 'parse5'

import {
  ACCORDION_BLOCK,
  BOOKMARK_BLOCK,
  CALLOUT_BLOCK,
  COMPARISON_TABLE_BLOCK,
  EMBED_BLOCK,
  GALLERY_BLOCK,
  PULL_QUOTE_BLOCK,
} from '../../blocks/schema'
import { resolveEmbed } from '../content/embed'
import { KEPT_ANCHOR } from '../content/headings'

type ChildNode = DefaultTreeAdapterTypes.ChildNode
type Element = DefaultTreeAdapterTypes.Element
type TextNode = DefaultTreeAdapterTypes.TextNode

/** A serialised Lexical node, structurally. */
export type LexicalNode = {
  [key: string]: unknown
  type: string
  version: number
  children?: LexicalNode[]
}

/** Editor state in the shape Payload stores in a `richText` field. */
export type LexicalState = {
  root: {
    type: 'root'
    version: 1
    format: ''
    indent: 0
    direction: null
    children: LexicalNode[]
  }
}

/** What the caller found for an image's `src`, in the Media library. */
export type MediaLookup =
  | { found: true; id: number | string; alt: string; filename: string }
  | { found: false; reason: string }

export type ConvertOptions = {
  /** Every image `src` the HTML holds, resolved — see `imageSources`. */
  media?: ReadonlyMap<string, MediaLookup>
  /** Ids for blocks, rows, links and uploads. Random 24-hex by default. */
  newId?: () => string
}

/** An image the conversion placed, and where. */
export type ConvertedImage = {
  src: string
  alt: string
  caption: string | null
  media: number | string
  as: 'upload' | 'gallery' | 'bookmark'
}

/** A heading as the HTML had it. */
export type LegacyHeading = {
  tag: string
  text: string
  id: string | null
}

export type LegacyConversion = {
  state: LexicalState
  /** Why the HTML cannot be converted faithfully. Empty means it can. */
  refusals: string[]
  /** What was left out on purpose, and why that loses nothing. */
  notes: string[]
  /** Ghost cards recognised, and the block each became. */
  cards: Array<{ card: string; block: string }>
  images: ConvertedImage[]
  headings: LegacyHeading[]
}

// --- Text formats, as Lexical numbers them ---------------------------------

export const FORMAT = {
  bold: 1,
  italic: 2,
  strikethrough: 4,
  underline: 8,
  code: 16,
  subscript: 32,
  superscript: 64,
} as const

const INLINE_FORMATS: Record<string, number> = {
  b: FORMAT.bold,
  strong: FORMAT.bold,
  em: FORMAT.italic,
  i: FORMAT.italic,
  s: FORMAT.strikethrough,
  strike: FORMAT.strikethrough,
  del: FORMAT.strikethrough,
  u: FORMAT.underline,
  code: FORMAT.code,
  sub: FORMAT.subscript,
  sup: FORMAT.superscript,
}

const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

/** Attributes that only ever describe how a file is fetched or sized. */
const IMAGE_PRESENTATION = new Set([
  'srcset',
  'sizes',
  'width',
  'height',
  'loading',
  'decoding',
])

function randomId(): string {
  const bytes = new Uint8Array(12)
  globalThis.crypto.getRandomValues(bytes)
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

// --- Reading the tree -------------------------------------------------------

function isElement(node: ChildNode): node is Element {
  return 'tagName' in node
}

function isText(node: ChildNode): node is TextNode {
  return node.nodeName === '#text'
}

function attr(element: Element, name: string): string | null {
  return element.attrs.find((a) => a.name === name)?.value ?? null
}

function classes(element: Element): Set<string> {
  return new Set((attr(element, 'class') ?? '').split(/\s+/).filter(Boolean))
}

/** Element children, ignoring whitespace and comments. */
function elementChildren(element: Element): Element[] {
  return element.childNodes.filter(isElement)
}

function textContent(node: ChildNode): string {
  if (isText(node)) return node.value
  if (!isElement(node)) return ''
  const inner =
    node.tagName === 'template'
      ? []
      : (node as Element).childNodes.map(textContent)
  return inner.join('')
}

function squash(text: string): string {
  return text.replace(/[\t\n\f\r ]+/g, ' ').trim()
}

/** Where a refusal is, in words: the element and the start of its text. */
function where(element: Element): string {
  const words = squash(textContent(element))
  const snippet = words.length > 60 ? `${words.slice(0, 57)}...` : words
  return snippet ? `<${element.tagName}> "${snippet}"` : `<${element.tagName}>`
}

/** Every image `src` in `html`, for the caller to look up before converting. */
export function imageSources(html: string): string[] {
  const found = new Set<string>()
  const walk = (nodes: ChildNode[]) => {
    for (const node of nodes) {
      if (!isElement(node)) continue
      if (node.tagName === 'img') {
        const src = attr(node, 'src')
        if (src) found.add(src)
      }
      walk(node.childNodes)
    }
  }
  walk(parseFragment(html).childNodes)
  return [...found]
}

// --- The converter ----------------------------------------------------------

type Link = { href: string }
type Segment =
  | { kind: 'text'; text: string; format: number; link: Link | null }
  | { kind: 'br'; link: Link | null }

class Converter {
  readonly refusals: string[] = []
  readonly notes = new Map<string, number>()
  readonly cards: Array<{ card: string; block: string }> = []
  readonly images: ConvertedImage[] = []
  readonly headings: LegacyHeading[] = []

  constructor(
    private readonly media: ReadonlyMap<string, MediaLookup>,
    private readonly newId: () => string,
  ) {}

  refuse(message: string): void {
    this.refusals.push(message)
  }

  note(message: string): void {
    this.notes.set(message, (this.notes.get(message) ?? 0) + 1)
  }

  /**
   * Refuses any attribute on `element` outside `allowed`. `data-*` is left
   * out without refusing: it carries editor bookkeeping (Ghost's, or a paste
   * from a chat window's `data-start`), and nothing on the site styles by it.
   */
  checkAttributes(element: Element, allowed: Iterable<string> = []): void {
    const ok = new Set(allowed)
    for (const { name } of element.attrs) {
      if (ok.has(name)) continue
      if (name.startsWith('data-')) {
        this.note(
          '`data-*` attributes are not carried: they are editor bookkeeping ' +
            'that nothing on the site reads.',
        )
        continue
      }
      this.refuse(
        `${where(element)} has a \`${name}\` attribute, which the editor ` +
          'cannot keep and which changes what a reader gets.',
      )
    }
  }

  // --- Blocks ---------------------------------------------------------------

  /** Block-level content: what sits directly in a body, or in a card's body. */
  blocks(nodes: ChildNode[], context: { allowCards: boolean }): LexicalNode[] {
    const out: LexicalNode[] = []
    let pending: ChildNode[] = []

    const flush = () => {
      if (!pending.length) return
      const segments = this.inline(pending, 0, null)
      pending = []
      if (segments.length) {
        this.note(
          'Text standing directly in the body, outside any paragraph, became ' +
            'a paragraph — the browser already showed it as one.',
        )
        out.push(paragraph(this.group(segments)))
      }
    }

    for (const node of nodes) {
      if (node.nodeName === '#comment') {
        flush()
        const data = (node as DefaultTreeAdapterTypes.CommentNode).data.trim()
        if (/^kg-card-(?:begin|end):/.test(data)) {
          this.note(
            "Ghost's card fences (`<!--kg-card-begin: …-->`) are not carried: " +
              'they mark where its editor put a card and are never rendered.',
          )
        } else {
          this.note('HTML comments are not carried: a reader never sees one.')
        }
        continue
      }
      if (isText(node)) {
        if (node.value.trim() || pending.length) pending.push(node)
        continue
      }
      if (!isElement(node)) continue
      if (isInlineElement(node)) {
        pending.push(node)
        continue
      }
      flush()
      out.push(...this.block(node, context))
    }
    flush()
    return out
  }

  block(element: Element, context: { allowCards: boolean }): LexicalNode[] {
    const tag = element.tagName
    const css = classes(element)

    if (tag === 'p') {
      this.checkAttributes(element)
      const only = elementChildren(element)
      const hasText = element.childNodes.some(
        (child) => isText(child) && child.value.trim(),
      )
      if (only.length === 1 && only[0].tagName === 'img' && !hasText) {
        return this.lonelyImage(only[0])
      }
      const segments = this.inline(element.childNodes, 0, null)
      if (!segments.length) {
        this.note(
          'Empty paragraphs are not carried: they hold no text and showed ' +
            'nothing but space.',
        )
        return []
      }
      return [paragraph(this.group(segments))]
    }

    if (HEADINGS.has(tag)) return [this.heading(element)]

    if (tag === 'ul' || tag === 'ol') return [this.list(element)]

    if (tag === 'blockquote') return this.quote(element)

    if (tag === 'hr') {
      this.checkAttributes(element)
      return [{ type: 'horizontalrule', version: 1 }]
    }

    if (tag === 'table') return this.table(element)

    if (tag === 'img') return this.lonelyImage(element)

    if (tag === 'figure') {
      if (!context.allowCards) {
        this.refuse(
          `${where(element)} sits inside a card, where no figure fits.`,
        )
        return []
      }
      if (css.has('kg-bookmark-card')) return this.bookmark(element)
      if (css.has('kg-gallery-card')) return this.gallery(element)
      if (css.has('kg-embed-card')) return this.embed(element)
      return this.figure(element)
    }

    if (tag === 'div') {
      if (css.has('kg-callout-card') && context.allowCards) {
        return this.callout(element)
      }
      if (css.has('kg-toggle-card') && context.allowCards) {
        return this.toggle(element)
      }
      if (element.attrs.every(({ name }) => name.startsWith('data-'))) {
        // A wrapper with nothing on it lays nothing out; Ghost's raw HTML
        // cards often arrive in one.
        this.checkAttributes(element)
        return this.blocks(element.childNodes, context)
      }
    }

    this.refuse(
      `${where(element)}${css.size ? ` (class "${[...css].join(' ')}")` : ''} ` +
        'has no equivalent in the editor.',
    )
    return []
  }

  heading(element: Element): LexicalNode {
    this.checkAttributes(element, ['id'])
    const id = attr(element, 'id')
    const text = squash(textContent(element))
    this.headings.push({ tag: element.tagName, text, id })

    if (id !== null && !KEPT_ANCHOR.test(id)) {
      this.refuse(
        `${where(element)} has the id "${id}", which a heading here cannot ` +
          'keep exactly.',
      )
    }
    const node: LexicalNode = {
      children: this.group(this.inline(element.childNodes, 0, null)),
      direction: null,
      format: '',
      indent: 0,
      type: 'heading',
      version: 1,
      tag: element.tagName,
    }
    if (id && KEPT_ANCHOR.test(id)) node.$ = { anchor: id }
    return node
  }

  list(element: Element, indent = 0): LexicalNode {
    const ordered = element.tagName === 'ol'
    this.checkAttributes(element, ordered ? ['start'] : [])
    const startAttr = ordered ? attr(element, 'start') : null
    const start = startAttr && /^\d+$/.test(startAttr) ? Number(startAttr) : 1
    if (startAttr && !/^\d+$/.test(startAttr)) {
      this.refuse(
        `${where(element)} starts at "${startAttr}", which a list here cannot.`,
      )
    }

    const items: LexicalNode[] = []
    let value = start
    for (const child of element.childNodes) {
      if (isText(child) && !child.value.trim()) continue
      if (child.nodeName === '#comment') continue
      if (!isElement(child) || child.tagName !== 'li') {
        this.refuse(`${where(element)} holds something other than list items.`)
        continue
      }
      this.checkAttributes(child)

      // A list item's own words, then any list nested in it. The editor keeps
      // a nested list in an item of its own, straight after its parent's —
      // which is how it has always rendered one.
      const own: ChildNode[] = []
      const nested: Element[] = []
      for (const part of child.childNodes) {
        if (
          isElement(part) &&
          (part.tagName === 'ul' || part.tagName === 'ol')
        ) {
          nested.push(part)
          continue
        }
        if (
          nested.length &&
          (isElement(part) || (isText(part) && part.value.trim()))
        ) {
          this.refuse(
            `${where(child)} has words after its nested list, an order the ` +
              'editor cannot keep.',
          )
          break
        }
        own.push(part)
      }

      const ownElements = own.filter(isElement)
      const paragraphs = ownElements.filter((part) => part.tagName === 'p')
      let inline: ChildNode[] = own
      if (paragraphs.length) {
        const strays = own.filter(
          (part) =>
            (isElement(part) && part.tagName !== 'p') ||
            (isText(part) && part.value.trim()),
        )
        if (paragraphs.length > 1 || strays.length) {
          this.refuse(
            `${where(child)} holds more than one paragraph, which a list item ` +
              'here cannot.',
          )
        } else {
          this.checkAttributes(paragraphs[0])
          inline = paragraphs[0].childNodes
        }
      }

      const segments = this.inline(inline, 0, null)
      if (segments.length || !nested.length) {
        items.push(listItem(this.group(segments), value, indent))
        value += 1
      }
      // The item holding a nested list takes the current number without
      // using it up, as Lexical's own list numbering does.
      for (const list of nested) {
        items.push(listItem([this.list(list, indent + 1)], value, indent))
      }
    }

    return {
      children: items,
      direction: null,
      format: '',
      indent: 0,
      type: 'list',
      version: 1,
      listType: ordered ? 'number' : 'bullet',
      start,
      tag: ordered ? 'ol' : 'ul',
    }
  }

  quote(element: Element): LexicalNode[] {
    const css = classes(element)
    const alt = css.has('kg-blockquote-alt')
    this.checkAttributes(element, alt ? ['class'] : [])
    if (alt) css.delete('kg-blockquote-alt')
    if (css.size) {
      this.refuse(
        `${where(element)} has class "${[...css].join(' ')}", which no quote here keeps.`,
      )
      return []
    }

    const parts = elementChildren(element)
    let inline: ChildNode[] = element.childNodes
    if (parts.some((part) => part.tagName === 'p')) {
      if (parts.length !== 1) {
        this.refuse(
          `${where(element)} holds more than one paragraph; a quote here holds one.`,
        )
        return []
      }
      this.checkAttributes(parts[0])
      inline = parts[0].childNodes
    }
    const segments = this.inline(inline, 0, null)

    if (alt) {
      // Ghost's large centred quote is the pull quote: plain words, set large.
      if (segments.some((s) => s.kind !== 'text' || s.format || s.link)) {
        this.refuse(
          `${where(element)} is a pull quote with formatting or a link in it; ` +
            'the pull quote module holds plain words.',
        )
        return []
      }
      this.cards.push({ card: 'kg-blockquote-alt', block: PULL_QUOTE_BLOCK })
      return [
        this.blockNode(PULL_QUOTE_BLOCK, {
          quote: segments
            .map((s) => (s.kind === 'text' ? s.text : ''))
            .join(''),
        }),
      ]
    }

    return [
      {
        children: this.group(segments),
        direction: null,
        format: '',
        indent: 0,
        type: 'quote',
        version: 1,
      },
    ]
  }

  // --- Images -----------------------------------------------------------------

  /** An image's Media document, or a refusal saying why there is none. */
  resolveImage(
    img: Element,
    as: ConvertedImage['as'],
    caption: string | null,
  ): { id: number | string } | null {
    this.checkAttributes(img, ['src', 'alt', 'class', ...IMAGE_PRESENTATION])
    const src = attr(img, 'src') ?? ''
    const alt = attr(img, 'alt') ?? ''
    if (!src) {
      this.refuse('An <img> has no `src`.')
      return null
    }
    const found = this.media.get(src)
    if (!found || !found.found) {
      this.refuse(
        `The image ${src} has no Media document to point at` +
          `${found && !found.found ? ` (${found.reason})` : ''}. Nothing is ` +
          're-uploaded or hotlinked by a conversion.',
      )
      return null
    }
    if (found.alt.trim() !== alt.trim()) {
      this.refuse(
        `The image ${src} has the alt text "${alt}", and its Media document ` +
          `(${found.filename}) has "${found.alt}". The editor shows the Media ` +
          "document's, so the page would change; make them agree first.",
      )
      return null
    }
    this.images.push({ src, alt, caption, media: found.id, as })
    return { id: found.id }
  }

  lonelyImage(img: Element): LexicalNode[] {
    const resolved = this.resolveImage(img, 'upload', null)
    return resolved ? [this.upload(resolved.id)] : []
  }

  upload(id: number | string): LexicalNode {
    return {
      type: 'upload',
      version: 3,
      format: '',
      fields: {},
      relationTo: 'media',
      value: id,
      id: this.newId(),
    }
  }

  /** A caption as the blocks hold one: plain words, nothing in them. */
  plainCaption(figcaption: Element | undefined, what: string): string | null {
    if (!figcaption) return null
    this.checkAttributes(figcaption)
    if (figcaption.childNodes.some(isElement)) {
      this.refuse(
        `The caption ${where(figcaption)} has formatting or a link in it; ` +
          `${what} holds a plain caption.`,
      )
      return null
    }
    return squash(textContent(figcaption)) || null
  }

  figure(element: Element): LexicalNode[] {
    const css = classes(element)
    css.delete('kg-card')
    css.delete('kg-image-card')
    if (css.has('kg-card-hascaption')) css.delete('kg-card-hascaption')
    if (css.size) {
      this.refuse(
        `${where(element)} has class "${[...css].join(' ')}" — a width or ` +
          'style no image here can take.',
      )
      return []
    }
    const parts = elementChildren(element)
    const img = parts.find((part) => part.tagName === 'img')
    const figcaption = parts.find((part) => part.tagName === 'figcaption')
    const strays = parts.filter((part) => part !== img && part !== figcaption)
    if (!img || strays.length) {
      this.refuse(
        `${where(element)} is a figure holding something other than one image ` +
          'and its caption.',
      )
      return []
    }
    const caption = this.plainCaption(figcaption, 'an image')
    if (
      figcaption &&
      caption === null &&
      figcaption.childNodes.some(isElement)
    ) {
      return []
    }
    if (caption === null) {
      this.cards.push({ card: 'kg-image-card', block: 'upload' })
      return this.lonelyImage(img)
    }
    // An image with a caption is a gallery of one: the only image this editor
    // can caption.
    const resolved = this.resolveImage(img, 'gallery', caption)
    if (!resolved) return []
    this.cards.push({ card: 'kg-image-card', block: GALLERY_BLOCK })
    return [
      this.blockNode(GALLERY_BLOCK, {
        items: [{ id: this.newId(), image: resolved.id, caption }],
      }),
    ]
  }

  gallery(element: Element): LexicalNode[] {
    const images: Element[] = []
    const walk = (nodes: ChildNode[]) => {
      for (const node of nodes) {
        if (!isElement(node)) continue
        if (node.tagName === 'img') images.push(node)
        else if (node.tagName !== 'figcaption') walk(node.childNodes)
      }
    }
    walk(element.childNodes)
    const figcaption = elementChildren(element).find(
      (p) => p.tagName === 'figcaption',
    )
    const caption = this.plainCaption(figcaption, 'the gallery module')
    const items = images.flatMap((img) => {
      const resolved = this.resolveImage(img, 'gallery', null)
      return resolved
        ? [{ id: this.newId(), image: resolved.id, caption: null }]
        : []
    })
    if (!images.length)
      this.refuse(`${where(element)} is a gallery with no images.`)
    if (items.length !== images.length) return []
    this.cards.push({ card: 'kg-gallery-card', block: GALLERY_BLOCK })
    return [
      this.blockNode(GALLERY_BLOCK, { items, ...(caption ? { caption } : {}) }),
    ]
  }

  bookmark(element: Element): LexicalNode[] {
    const find = (cls: string): Element | undefined => {
      let hit: Element | undefined
      const walk = (nodes: ChildNode[]) => {
        for (const node of nodes) {
          if (hit || !isElement(node)) continue
          if (classes(node).has(cls)) hit = node
          else walk(node.childNodes)
        }
      }
      walk(element.childNodes)
      return hit
    }
    const container = find('kg-bookmark-container')
    const url = container ? (attr(container, 'href') ?? '') : ''
    // A part the card does not have is empty, never the card's whole text.
    const part = (cls: string) => {
      const found = find(cls)
      return found ? squash(textContent(found)) : ''
    }
    const title = part('kg-bookmark-title')
    const description = part('kg-bookmark-description')
    const publisher = part('kg-bookmark-publisher')
    const author = part('kg-bookmark-author')
    const thumbnail = find('kg-bookmark-thumbnail')
    const icon = find('kg-bookmark-icon')

    if (!find('kg-bookmark-title'))
      this.refuse(`${where(element)} is a bookmark with no title.`)
    try {
      if (new URL(url).protocol !== 'https:') throw new Error()
    } catch {
      this.refuse(
        `${where(element)} bookmarks "${url}"; the module takes an https:// address.`,
      )
    }
    if (author && publisher && author !== publisher) {
      this.refuse(
        `${where(element)} names an author ("${author}") and a publisher ` +
          `("${publisher}"); the bookmark module has one source line.`,
      )
    }
    if (elementChildren(element).some((p) => p.tagName === 'figcaption')) {
      this.refuse(
        `${where(element)} has a caption; the bookmark module has none.`,
      )
    }
    if (icon) {
      if ((attr(icon, 'alt') ?? '') !== '') {
        this.refuse(
          `${where(element)} has a favicon with alt text; the module shows no favicon.`,
        )
      } else {
        this.note(
          "A bookmark's favicon is not carried: Ghost marks it decorative " +
            '(empty alt), and the bookmark module draws its own card.',
        )
      }
    }
    const img = thumbnail?.childNodes.find(
      (node): node is Element => isElement(node) && node.tagName === 'img',
    )
    const image = img ? this.resolveImage(img, 'bookmark', null) : null
    if (img && !image) return []

    this.cards.push({ card: 'kg-bookmark-card', block: BOOKMARK_BLOCK })
    return [
      this.blockNode(BOOKMARK_BLOCK, {
        url,
        title,
        ...(description ? { description } : {}),
        ...(publisher || author ? { publisher: publisher || author } : {}),
        ...(image ? { image: image.id } : {}),
      }),
    ]
  }

  embed(element: Element): LexicalNode[] {
    const parts = elementChildren(element)
    const iframe = parts.find((part) => part.tagName === 'iframe')
    if (!iframe || parts.some((p) => p !== iframe)) {
      this.refuse(
        `${where(element)} is an embed that is not a single video frame, or ` +
          'has a caption; the embed module holds one YouTube or Vimeo video.',
      )
      return []
    }
    const src = attr(iframe, 'src') ?? ''
    const title = squash(attr(iframe, 'title') ?? '')
    if (!resolveEmbed(src)) {
      this.refuse(
        `The embed ${src} is not a YouTube or Vimeo video the embed module will frame.`,
      )
      return []
    }
    if (!title) {
      this.refuse(
        `The embed ${src} has no title, which the embed module requires.`,
      )
      return []
    }
    this.cards.push({ card: 'kg-embed-card', block: EMBED_BLOCK })
    return [this.blockNode(EMBED_BLOCK, { url: src, title })]
  }

  callout(element: Element): LexicalNode[] {
    const css = classes(element)
    const color = [...css]
      .map((name) => /^kg-callout-card-(.+)$/.exec(name)?.[1])
      .find(Boolean)
    const tone =
      color === undefined || color === 'grey' || color === 'white'
        ? 'neutral'
        : color === 'accent'
          ? 'accent'
          : null
    if (!tone) {
      this.refuse(
        `${where(element)} is a ${color} callout; the callout module comes in ` +
          'neutral, accent and dark only.',
      )
      return []
    }
    const parts = elementChildren(element)
    const emoji = parts.find((p) => classes(p).has('kg-callout-emoji'))
    const body = parts.find((p) => classes(p).has('kg-callout-text'))
    if (!body || parts.some((p) => p !== emoji && p !== body)) {
      this.refuse(
        `${where(element)} is a callout with more than an emoji and its text.`,
      )
      return []
    }
    const segments = this.inline(body.childNodes, 0, null)
    this.cards.push({ card: 'kg-callout-card', block: CALLOUT_BLOCK })
    return [
      this.blockNode(CALLOUT_BLOCK, {
        ...(emoji && squash(textContent(emoji))
          ? { emoji: squash(textContent(emoji)) }
          : {}),
        tone,
        content: richText([paragraph(this.group(segments))]),
      }),
    ]
  }

  toggle(element: Element): LexicalNode[] {
    const find = (cls: string): Element | undefined => {
      let hit: Element | undefined
      const walk = (nodes: ChildNode[]) => {
        for (const node of nodes) {
          if (hit || !isElement(node)) continue
          if (classes(node).has(cls)) hit = node
          else walk(node.childNodes)
        }
      }
      walk(element.childNodes)
      return hit
    }
    const heading = find('kg-toggle-heading-text')
    const content = find('kg-toggle-content')
    const title = heading ? squash(textContent(heading)) : ''
    if (!title || !content) {
      this.refuse(`${where(element)} is a toggle without a heading or a body.`)
      return []
    }
    const inner = this.blocks(content.childNodes, { allowCards: false })
    if (inner.some((node) => node.type === 'heading')) {
      this.refuse(
        `${where(element)} has a heading inside its panel, which a dropdown panel here cannot anchor.`,
      )
      return []
    }
    this.cards.push({ card: 'kg-toggle-card', block: ACCORDION_BLOCK })
    return [
      this.blockNode(ACCORDION_BLOCK, {
        items: [{ id: this.newId(), title, content: richText(inner) }],
      }),
    ]
  }

  // --- Tables -----------------------------------------------------------------

  /**
   * A table as a comparison table, where it fits one: a caption, a header row,
   * a first column naming the rows, at most five value columns and thirty
   * rows, and cells holding words, emphasis, code and links. The block owns
   * its markup — header scopes, the caption — so anything the HTML says about
   * presentation is not carried, and anything it says about structure that
   * the block cannot say (merged cells, a second header row) is a refusal.
   */
  table(element: Element): LexicalNode[] {
    this.checkAttributes(element)
    const before = this.refusals.length
    let caption = ''
    const rows: Element[] = []
    for (const part of elementChildren(element)) {
      this.checkAttributes(part)
      if (part.tagName === 'caption') {
        caption = this.plainCaption(part, 'the comparison table') ?? ''
      } else if (
        part.tagName === 'thead' ||
        part.tagName === 'tbody' ||
        part.tagName === 'tfoot'
      ) {
        for (const row of elementChildren(part)) rows.push(row)
      } else if (part.tagName === 'tr') {
        rows.push(part)
      } else {
        this.refuse(
          `${where(part)} inside a table has no place in a comparison table.`,
        )
      }
    }
    if (!caption) {
      this.refuse(
        `The table ${where(element)} has no caption. A comparison table must ` +
          'have one to publish, and a conversion adds no words the article ' +
          'never had.',
      )
    }

    const cells = rows.map((row) => {
      this.checkAttributes(row)
      return elementChildren(row).map((cell) => {
        this.checkAttributes(cell)
        if (cell.tagName !== 'td' && cell.tagName !== 'th') {
          this.refuse(`${where(cell)} sits in a table row.`)
        }
        return cell
      })
    })
    const [header, ...body] = cells
    if (!header?.length || header.some((cell) => cell.tagName !== 'th')) {
      this.refuse(
        `The table ${where(element)} has no header row of <th> cells.`,
      )
      return []
    }
    const width = header.length
    if (width < 2 || width > 6) {
      this.refuse(
        `The table ${where(element)} has ${width} columns; a comparison table ` +
          'has a row-label column and one to five more.',
      )
    }
    if (!body.length || body.length > 30) {
      this.refuse(
        `The table ${where(element)} has ${body.length} rows; a comparison table has 1 to 30.`,
      )
    }
    if (body.some((row) => row.length !== width)) {
      this.refuse(`The table ${where(element)} has rows of different lengths.`)
    }
    if (this.refusals.length > before) return []

    const label = (cell: Element) => this.headerText(cell)
    const block = this.blockNode(COMPARISON_TABLE_BLOCK, {
      caption,
      ...(label(header[0]) ? { rowHeader: label(header[0]) } : {}),
      columns: header
        .slice(1)
        .map((cell) => ({ id: this.newId(), label: label(cell) })),
      rows: body.map((row) => ({
        id: this.newId(),
        label: this.cellMarkdown(row[0]),
        cells: row.slice(1).map((cell) => ({
          id: this.newId(),
          value: this.cellMarkdown(cell),
        })),
      })),
    })
    if (this.refusals.length > before) return []
    this.cards.push({ card: 'html table', block: COMPARISON_TABLE_BLOCK })
    return [block]
  }

  /**
   * A header cell's label: plain words. A `<strong>` around all of it is
   * allowed and not carried, since a header cell is set bold already.
   */
  headerText(cell: Element): string {
    const segments = this.inline(cell.childNodes, 0, null)
    if (
      segments.some(
        (s) => s.kind !== 'text' || s.link || (s.format & ~FORMAT.bold) !== 0,
      )
    ) {
      this.refuse(
        `The header cell ${where(cell)} has formatting a column heading cannot hold.`,
      )
      return ''
    }
    const formats = new Set(
      segments.map((s) => (s.kind === 'text' ? s.format : 0)),
    )
    if (formats.size > 1) {
      this.refuse(
        `The header cell ${where(cell)} is partly bold, which a column heading cannot be.`,
      )
    } else if (formats.has(FORMAT.bold)) {
      this.note(
        'Bold around a whole table header cell is not carried: header cells are bold.',
      )
    }
    return segments.map((s) => (s.kind === 'text' ? s.text : '')).join('')
  }

  /** A cell as the inline Markdown the comparison table reads. */
  cellMarkdown(cell: Element): string {
    const segments = this.inline(cell.childNodes, 0, null)
    let out = ''
    let link = null as Link | null
    let linkText = ''
    const wrap = (text: string, format: number): string => {
      if (format & ~(FORMAT.bold | FORMAT.italic | FORMAT.code)) {
        this.refuse(
          `The cell ${where(cell)} has formatting a table cell cannot hold.`,
        )
        return text
      }
      if (format & FORMAT.code) {
        if (text.includes('`')) {
          this.refuse(`The cell ${where(cell)} has a backtick in code.`)
        }
        return `\`${text}\``
      }
      const escaped = escapeInlineMarkdown(text)
      if (format === (FORMAT.bold | FORMAT.italic)) return `***${escaped}***`
      if (format & FORMAT.bold) return `**${escaped}**`
      if (format & FORMAT.italic) return `*${escaped}*`
      return escaped
    }
    const closeLink = () => {
      if (!link) return
      if (!/^(?:https:\/\/|\/)/.test(link.href)) {
        this.refuse(
          `The cell ${where(cell)} links to ${link.href}; a table cell links ` +
            'to a page on this site or an https:// address.',
        )
      }
      if (/[()\s]/.test(link.href)) {
        // Inline Markdown ends a link's address at a parenthesis or a space,
        // and percent-encoding one would change the href a reader follows.
        this.refuse(
          `The cell ${where(cell)} links to ${link.href}, an address with a ` +
            'parenthesis or a space, which a table cell cannot hold exactly.',
        )
      }
      out += `[${linkText}](${link.href})`
      link = null
      linkText = ''
    }
    for (const segment of segments) {
      if (segment.kind === 'br') {
        this.refuse(
          `The cell ${where(cell)} has a line break, which a table cell cannot hold.`,
        )
        continue
      }
      if (segment.link !== link) closeLink()
      if (segment.link) {
        link = segment.link
        linkText += wrap(segment.text, segment.format)
      } else {
        out += wrap(segment.text, segment.format)
      }
    }
    closeLink()
    return out
  }

  // --- Inline -----------------------------------------------------------------

  /** Inline content as a flat run of text and breaks, whitespace as rendered. */
  inline(nodes: ChildNode[], format: number, link: Link | null): Segment[] {
    return collapse(this.segments(nodes, format, link))
  }

  segments(nodes: ChildNode[], format: number, link: Link | null): Segment[] {
    const out: Segment[] = []
    for (const node of nodes) {
      if (isText(node)) {
        out.push({ kind: 'text', text: node.value, format, link })
        continue
      }
      if (node.nodeName === '#comment') {
        this.note('HTML comments are not carried: a reader never sees one.')
        continue
      }
      if (!isElement(node)) continue
      const tag = node.tagName

      if (tag in INLINE_FORMATS) {
        this.checkAttributes(node)
        out.push(
          ...this.segments(node.childNodes, format | INLINE_FORMATS[tag], link),
        )
      } else if (tag === 'span') {
        this.checkAttributes(node)
        out.push(...this.segments(node.childNodes, format, link))
      } else if (tag === 'br') {
        this.checkAttributes(node)
        out.push({ kind: 'br', link })
      } else if (tag === 'a') {
        out.push(...this.anchor(node, format, link))
      } else {
        this.refuse(
          `${where(node)} sits inside a line of text, where the editor has ` +
            'nothing to hold it.',
        )
      }
    }
    return out
  }

  anchor(element: Element, format: number, outer: Link | null): Segment[] {
    this.checkAttributes(element, ['href', 'rel'])
    if (outer) {
      this.refuse(`${where(element)} is a link inside a link.`)
      return []
    }
    const href = attr(element, 'href')
    if (!href) {
      this.refuse(`${where(element)} is a link with no address.`)
      return []
    }
    if (/^\s*(?:javascript|data|vbscript):/i.test(href)) {
      this.refuse(
        `${where(element)} links to a ${href.split(':')[0]}: address.`,
      )
      return []
    }
    const rel = (attr(element, 'rel') ?? '').split(/\s+/).filter(Boolean)
    for (const token of rel) {
      if (token.toLowerCase() === 'noopener') {
        this.note(
          '`rel="noopener"` on a link that opens in the same tab is not ' +
            'carried: it only does anything for a link that opens a new one.',
        )
      } else {
        this.refuse(
          `${where(element)} has rel="${rel.join(' ')}". The editor's links ` +
            `cannot carry "${token}", and it changes how the link is treated.`,
        )
      }
    }
    const segments = this.segments(element.childNodes, format, { href })
    if (!segments.some((s) => s.kind === 'text' && s.text.trim())) {
      this.refuse(`A link to ${href} has no text.`)
      return []
    }
    return segments
  }

  /** Segments as Lexical inline nodes: links grouped, like text runs merged. */
  group(segments: Segment[]): LexicalNode[] {
    const out: LexicalNode[] = []
    let current = null as { link: Link; node: LexicalNode } | null

    const push = (target: LexicalNode[], segment: Segment) => {
      if (segment.kind === 'br') {
        target.push({ type: 'linebreak', version: 1 })
        return
      }
      const last = target.at(-1)
      if (last?.type === 'text' && last.format === segment.format) {
        last.text = `${last.text as string}${segment.text}`
        return
      }
      target.push(textNode(segment.text, segment.format))
    }

    for (const segment of segments) {
      if (segment.link) {
        if (current?.link !== segment.link) {
          current = {
            link: segment.link,
            node: {
              children: [],
              direction: null,
              format: '',
              indent: 0,
              type: 'link',
              version: 3,
              fields: {
                linkType: 'custom',
                newTab: false,
                url: segment.link.href,
              },
              id: this.newId(),
            },
          }
          out.push(current.node)
        }
        push(current.node.children!, segment)
      } else {
        current = null
        push(out, segment)
      }
    }
    return out
  }

  blockNode(blockType: string, fields: Record<string, unknown>): LexicalNode {
    return {
      type: 'block',
      version: 2,
      format: '',
      fields: { id: this.newId(), blockName: '', blockType, ...fields },
    }
  }
}

const INLINE_TAGS = new Set([...Object.keys(INLINE_FORMATS), 'a', 'span', 'br'])

function isInlineElement(element: Element): boolean {
  return INLINE_TAGS.has(element.tagName)
}

/**
 * Whitespace as the browser shows it: runs of spaces, tabs and newlines as
 * one space, none at the start or end of a block or either side of a line
 * break. A no-break space is a character, not whitespace, and is kept.
 */
function collapse(segments: Segment[]): Segment[] {
  const out: Segment[] = []
  let afterSpace = true
  for (const segment of segments) {
    if (segment.kind === 'br') {
      trimEnd(out)
      out.push(segment)
      afterSpace = true
      continue
    }
    let text = segment.text.replace(/[\t\n\f\r ]+/g, ' ')
    if (afterSpace) text = text.replace(/^ /, '')
    if (!text) continue
    afterSpace = text.endsWith(' ')
    out.push({ ...segment, text })
  }
  trimEnd(out)
  return out
}

function trimEnd(segments: Segment[]): void {
  while (segments.length) {
    const last = segments[segments.length - 1]
    if (last.kind !== 'text') return
    const text = last.text.replace(/ $/, '')
    if (text) {
      segments[segments.length - 1] = { ...last, text }
      return
    }
    segments.pop()
  }
}

function textNode(text: string, format: number): LexicalNode {
  return {
    detail: 0,
    format,
    mode: 'normal',
    style: '',
    text,
    type: 'text',
    version: 1,
  }
}

/**
 * A paragraph. `textFormat` is the format of its first direct text child,
 * which is what Lexical's own `ParagraphNode.exportJSON` writes — so the
 * node is byte-for-byte what the editor, or a Markdown import, would store.
 */
function paragraph(children: LexicalNode[]): LexicalNode {
  const first = children.find((child) => child.type === 'text')
  return {
    children,
    direction: null,
    format: '',
    indent: 0,
    type: 'paragraph',
    version: 1,
    textFormat: first ? Number(first.format ?? 0) : 0,
    textStyle: '',
  }
}

function listItem(
  children: LexicalNode[],
  value: number,
  indent: number,
): LexicalNode {
  return {
    children,
    direction: null,
    format: '',
    indent,
    type: 'listitem',
    version: 1,
    value,
  }
}

function richText(children: LexicalNode[]): LexicalState {
  return {
    root: {
      type: 'root',
      version: 1,
      format: '',
      indent: 0,
      direction: null,
      children,
    },
  }
}

/** Text for inline Markdown, with every character it would read escaped. */
export function escapeInlineMarkdown(text: string): string {
  return text.replace(/[\\`*_[\]()!#+\-.|]/g, (char) => `\\${char}`)
}

/**
 * `html` as the posts editor's Lexical, and everything the conversion noticed.
 *
 * Never throws for the content of the HTML: every problem is a refusal in the
 * result, so a dry run can list them all at once.
 */
export function convertLegacyHtml(
  html: string,
  options: ConvertOptions = {},
): LegacyConversion {
  const converter = new Converter(
    options.media ?? new Map(),
    options.newId ?? randomId,
  )
  const children = converter.blocks(parseFragment(html).childNodes, {
    allowCards: true,
  })
  return {
    state: richText(children),
    refusals: converter.refusals,
    notes: [...converter.notes].map(([note, count]) =>
      count > 1 ? `${note} (${count}×)` : note,
    ),
    cards: converter.cards,
    images: converter.images,
    headings: converter.headings,
  }
}
