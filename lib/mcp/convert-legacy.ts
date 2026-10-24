// Converting one migrated article into the editor — checked, then saved as a
// draft. Shared by the `convertLegacyArticle` MCP tool and
// `pnpm content:convert-legacy`, so the two cannot disagree about what a safe
// conversion is.
//
// `lib/migration/legacy-to-lexical.ts` does the conversion and refuses what it
// cannot represent. This file does not trust it: it checks the result against
// the HTML from the outside, the way a reader would see the two pages —
//
//   plain text   the words of both bodies, through `lib/content/plain-text.ts`,
//                as the page renders them (title heading stripped), must match
//   heading ids  each legacy heading's id must be the id the renderer will
//                give the converted heading
//   links        every href in the HTML must be in the converted body, and
//                nothing else
//   images       every image must be placed, against an existing Media doc
//   round trip   the body must come back unchanged through what
//                `readArticleMarkdown` and `updateArticleMarkdown` do to it,
//                or the first Markdown revision would quietly damage it
//
// — and any failure is a refusal like the converter's own. A dry run returns
// all of it. A real run saves only when there is nothing refused, only into an
// empty `content`, only as a draft, and never touches `legacyHTML`: emptying
// `content` again puts the page back exactly as it was.

import type { Payload, PayloadRequest, TypedUser } from 'payload'
import { parseFragment, serialize, type DefaultTreeAdapterTypes } from 'parse5'

import {
  BOOKMARK_BLOCK,
  COMPARISON_TABLE_BLOCK,
  GALLERY_BLOCK,
} from '../../blocks/schema'
import { toArticleBody, type BodyNode } from '../content/body'
import {
  createAnchorAllocator,
  headingText,
  keptAnchor,
  keptAnchors,
} from '../content/headings'
import { bodyToPlainText } from '../content/plain-text'
import { isEmptyRichText } from '../content/richtext'
import { deriveMediaFilename } from '../migration/media-rewrite'
import {
  convertLegacyHtml,
  FORMAT,
  imageSources,
  type LegacyConversion,
  type LexicalNode,
  type LexicalState,
  type MediaLookup,
} from '../migration/legacy-to-lexical'
import { markAnchors, restoreAnchors } from './anchors'
import { markBlocks, restoreBlocks } from './blocks'
import {
  lexicalToMarkdown,
  markdownToLexical,
  type EditorState,
} from './markdown'

type Element = DefaultTreeAdapterTypes.Element
type ChildNode = DefaultTreeAdapterTypes.ChildNode

/** Who is asking, and whether their access rules apply. */
export type ConversionAccess = {
  req?: PayloadRequest
  overrideAccess: boolean
}

export type HeadingIdCheck = {
  tag: string
  text: string
  /** The id the migrated page renders, or null where Ghost gave none. */
  legacy: string | null
  /** The id the converted page will render. */
  converted: string | null
}

export type ConversionReport = {
  id: number | string
  slug: string
  /** Nothing refused: a real run would save. */
  convertible: boolean
  refused: string[]
  plainText: {
    equal: boolean
    legacyCharacters: number
    convertedCharacters: number
    firstDifference?: { legacy: string; converted: string }
  }
  headingIds: {
    equal: boolean
    headings: HeadingIdCheck[]
  }
  links: {
    legacy: number
    converted: number
    missing: string[]
    extra: string[]
  }
  images: {
    legacy: number
    converted: number
    placed: LegacyConversion['images']
  }
  roundTrip: { unchanged: boolean; difference?: string }
  cards: LegacyConversion['cards']
  notes: string[]
}

// --- Reading HTML ------------------------------------------------------------

function isElement(node: ChildNode): node is Element {
  return 'tagName' in node
}

function elements(html: string): Element[] {
  const out: Element[] = []
  const walk = (nodes: ChildNode[]) => {
    for (const node of nodes) {
      if (!isElement(node)) continue
      out.push(node)
      walk(node.childNodes)
    }
  }
  walk(parseFragment(html).childNodes)
  return out
}

function attr(element: Element, name: string): string | null {
  return element.attrs.find((a) => a.name === name)?.value ?? null
}

function textOf(node: ChildNode): string {
  if (node.nodeName === '#text')
    return (node as DefaultTreeAdapterTypes.TextNode).value
  return isElement(node) ? node.childNodes.map(textOf).join('') : ''
}

/** Character references decoded, the way a browser reads them. */
function decodeReferences(text: string): string {
  return parseFragment(text).childNodes.map(textOf).join('')
}

function inside(element: Element, className: string): boolean {
  let node: unknown = element
  while (node && typeof node === 'object' && 'parentNode' in node) {
    const parent = (node as { parentNode: unknown }).parentNode
    if (parent && typeof parent === 'object' && 'attrs' in parent) {
      const css = attr(parent as Element, 'class') ?? ''
      if (css.split(/\s+/).includes(className)) return true
    }
    node = parent
  }
  return false
}

// --- Reading the converted body ---------------------------------------------

/** Every node in a rich-text value, rich text nested in block fields included. */
function* walk(nodes: unknown): Generator<LexicalNode> {
  if (!Array.isArray(nodes)) return
  for (const node of nodes as LexicalNode[]) {
    yield node
    yield* walk(node.children)
    if (node.type === 'block')
      yield* walkFields((node as { fields?: unknown }).fields)
  }
}

function* walkFields(value: unknown): Generator<LexicalNode> {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const item of value) yield* walkFields(item)
    return
  }
  const root = (value as { root?: { children?: unknown } }).root
  if (root && Array.isArray(root.children)) {
    yield* walk(root.children)
    return
  }
  for (const field of Object.values(value)) yield* walkFields(field)
}

type BlockFields = Record<string, unknown> & { blockType?: string }

const blockFields = (node: LexicalNode): BlockFields =>
  ((node as { fields?: BlockFields }).fields ?? {}) as BlockFields

/** A link in an inline-Markdown table cell: `[text](href)`, escapes allowed. */
const CELL_LINK = /\[(?:[^\]\\]|\\.)*\]\(([^)\s]+)\)/g

function convertedLinks(state: LexicalState): string[] {
  const hrefs: string[] = []
  for (const node of walk(state.root.children)) {
    if (node.type === 'link') {
      hrefs.push(
        String((node as { fields?: { url?: unknown } }).fields?.url ?? ''),
      )
    }
    if (node.type !== 'block') continue
    const fields = blockFields(node)
    if (fields.blockType === BOOKMARK_BLOCK)
      hrefs.push(String(fields.url ?? ''))
    if (fields.blockType === COMPARISON_TABLE_BLOCK) {
      const rows = (fields.rows ?? []) as Array<{
        label?: string
        cells?: Array<{ value?: string }>
      }>
      for (const row of rows) {
        for (const text of [
          row.label,
          ...(row.cells ?? []).map((cell) => cell.value),
        ]) {
          for (const match of (text ?? '').matchAll(CELL_LINK)) {
            hrefs.push(match[1])
          }
        }
      }
    }
  }
  return hrefs
}

function convertedImageCount(state: LexicalState): number {
  let count = 0
  for (const node of walk(state.root.children)) {
    if (node.type === 'upload') count += 1
    if (node.type !== 'block') continue
    const fields = blockFields(node)
    if (fields.blockType === GALLERY_BLOCK)
      count += ((fields.items ?? []) as unknown[]).length
    if (fields.blockType === BOOKMARK_BLOCK && fields.image != null) count += 1
  }
  return count
}

/** Each of `a` not matched one-for-one in `b`. */
function without(a: string[], b: string[]): string[] {
  const left = [...b]
  return a.filter((item) => {
    const at = left.indexOf(item)
    if (at === -1) return true
    left.splice(at, 1)
    return false
  })
}

// --- The checks ---------------------------------------------------------------

const squash = (text: string) => text.replace(/\s+/gu, '')

/**
 * The migrated HTML with each card's words where its module keeps them, for
 * the text comparison.
 *
 * The comparison runs both bodies through `lib/content/plain-text.ts`, which
 * reads a module through its serializer, and two serializers count a card's
 * words differently from a tag strip: a callout's emoji is decoration the
 * serializer leaves out (the module still shows it), and an embed's title —
 * an attribute on Ghost's iframe, so invisible to a tag strip — is the one
 * line of text the embed module has. Both are moved here, so the comparison
 * measures words lost or gained, not two ways of counting the same words.
 */
function comparableLegacyHtml(html: string): string {
  const fragment = parseFragment(html)
  const visit = (parent: { childNodes: ChildNode[] }) => {
    parent.childNodes = parent.childNodes.flatMap((node): ChildNode[] => {
      if (!isElement(node)) return [node]
      const css = (attr(node, 'class') ?? '').split(/\s+/)
      if (css.includes('kg-callout-emoji')) return []
      if (node.tagName === 'iframe') {
        const title = (attr(node, 'title') ?? '').replace(/[<&]/g, ' ')
        return parseFragment(` ${title} `).childNodes
      }
      visit(node)
      return [node]
    })
  }
  visit(fragment)
  return serialize(fragment)
}

function comparePlainText(
  html: string,
  state: LexicalState,
  title: string,
): ConversionReport['plainText'] {
  const legacy = squash(
    decodeReferences(
      bodyToPlainText(
        toArticleBody({ legacyHTML: comparableLegacyHtml(html), title }),
      ),
    ),
  )
  const converted = squash(
    bodyToPlainText(toArticleBody({ content: state, title })),
  )
  if (legacy === converted) {
    return {
      equal: true,
      legacyCharacters: legacy.length,
      convertedCharacters: converted.length,
    }
  }
  let at = 0
  while (at < legacy.length && legacy[at] === converted[at]) at += 1
  const around = (text: string) => text.slice(Math.max(0, at - 30), at + 40)
  return {
    equal: false,
    legacyCharacters: legacy.length,
    convertedCharacters: converted.length,
    firstDifference: { legacy: around(legacy), converted: around(converted) },
  }
}

/**
 * Legacy heading ids against the ids the converted page will render.
 *
 * Both sides as readers get them: through `toArticleBody`, so a leading
 * heading that repeats the title is stripped from each exactly as the page
 * strips it. The converted ids come from the renderer's own allocator, seeded
 * and consulted the way `buildConverters` does it.
 */
function compareHeadingIds(
  html: string,
  state: LexicalState,
  title: string,
): ConversionReport['headingIds'] {
  const legacyBody = toArticleBody({ legacyHTML: html, title })
  const legacy =
    legacyBody.kind === 'html'
      ? elements(legacyBody.html).filter(
          (el) => /^h[1-6]$/.test(el.tagName) && !inside(el, 'kg-toggle-card'),
        )
      : []

  const convertedBody = toArticleBody({ content: state, title })
  const children: BodyNode[] =
    convertedBody.kind === 'lexical'
      ? (convertedBody.content.root.children ?? [])
      : []
  const allocate = createAnchorAllocator(keptAnchors(children))
  const converted = children
    .filter((node) => node.type === 'heading')
    .map((node) => ({
      tag: String(node.tag ?? 'h2'),
      text: headingText(node),
      id: allocate(headingText(node), keptAnchor(node)),
    }))

  const headings: HeadingIdCheck[] = []
  for (
    let index = 0;
    index < Math.max(legacy.length, converted.length);
    index += 1
  ) {
    const before = legacy[index]
    const after = converted[index]
    headings.push({
      tag: before?.tagName ?? after?.tag ?? '',
      text:
        after?.text ??
        (before ? textOf(before).replace(/\s+/g, ' ').trim() : ''),
      legacy: before ? attr(before, 'id') : null,
      converted: after?.id ?? null,
    })
  }
  const equal =
    legacy.length === converted.length &&
    headings.every(
      (heading) =>
        heading.legacy === null || heading.legacy === heading.converted,
    )
  return { equal, headings }
}

/** Text formats Markdown has no syntax for, which a revision would flatten. */
const UNSPOKEN_FORMATS: Array<[number, string]> = [
  [FORMAT.underline, 'underlined'],
  [FORMAT.subscript, 'subscript'],
  [FORMAT.superscript, 'superscript'],
]

/** What `readArticleMarkdown` then `updateArticleMarkdown` would lose, by name. */
function markdownLosses(state: LexicalState): string[] {
  const losses = new Map<string, string>()
  for (const node of walk(state.root.children)) {
    if (node.type === 'linebreak') {
      losses.set(
        'linebreak',
        'line breaks inside a paragraph, which come back as spaces',
      )
    }
    if (node.type !== 'text') continue
    const format = Number(node.format ?? 0)
    for (const [bit, name] of UNSPOKEN_FORMATS) {
      if (format & bit && !losses.has(name)) {
        losses.set(
          name,
          `${name} text (first: "${String(node.text)}"), which comes back plain`,
        )
      }
    }
  }
  return [...losses.values()]
}

/** A body as compared after a round trip: the ids a conversion mints dropped. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (!value || typeof value !== 'object') return value
  const node = value as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(node).sort()) {
    if (key === 'id' && (node.type === 'link' || node.type === 'upload'))
      continue
    out[key] = canonical(node[key])
  }
  return out
}

function firstDifference(a: unknown, b: unknown, path = 'body'): string | null {
  if (JSON.stringify(a) === JSON.stringify(b)) return null
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    for (const key of keys) {
      const found = firstDifference(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
        Array.isArray(a) ? `${path}[${key}]` : `${path}.${key}`,
      )
      if (found) return found
    }
  }
  const show = (value: unknown) => {
    const text = JSON.stringify(value) ?? 'nothing'
    return text.length > 120 ? `${text.slice(0, 117)}...` : text
  }
  return `${path}: ${show(a)} becomes ${show(b)}`
}

/**
 * The body through what the Markdown tools do to it: read out with block
 * markers and anchor suffixes, read back, modules and anchors restored. The
 * same functions, in the same order, as `readArticleMarkdown` and
 * `updateArticleMarkdown`.
 */
function checkRoundTrip(
  payload: Payload,
  state: LexicalState,
): ConversionReport['roundTrip'] {
  try {
    const current = state as unknown as EditorState
    const markdown = lexicalToMarkdown(
      payload,
      'posts',
      markBlocks(markAnchors(current)),
    )
    const back = restoreAnchors(
      restoreBlocks(markdownToLexical(payload, 'posts', markdown), current)
        .state,
    )
    const difference = firstDifference(canonical(state), canonical(back))
    return difference ? { unchanged: false, difference } : { unchanged: true }
  } catch (error) {
    return {
      unchanged: false,
      difference: error instanceof Error ? error.message : String(error),
    }
  }
}

// --- Media --------------------------------------------------------------------

/**
 * Each image `src` matched to the Media document it was migrated as.
 *
 * By filename, which is what the Ghost import derived each upload's name from
 * (`deriveMediaFilename`) and what the stored HTML's addresses end in. Exactly
 * one match or none: two documents with one filename is a question for a
 * person, not a guess.
 */
export async function resolveMedia(
  payload: Payload,
  sources: string[],
  access: ConversionAccess,
): Promise<Map<string, MediaLookup>> {
  const lookups = new Map<string, MediaLookup>()
  if (!sources.length) return lookups
  const names = [...new Set(sources.map(deriveMediaFilename))]
  const { docs } = await payload.find({
    collection: 'media',
    depth: 0,
    limit: names.length * 2 + 1,
    pagination: false,
    overrideAccess: access.overrideAccess,
    req: access.req,
    user: access.req?.user as TypedUser | undefined,
    where: { filename: { in: names } },
  })
  for (const src of sources) {
    const filename = deriveMediaFilename(src)
    const matches = (
      docs as unknown as Array<{
        id: number | string
        filename?: string
        alt?: string
      }>
    ).filter((doc) => doc.filename === filename)
    lookups.set(
      src,
      matches.length === 1
        ? {
            found: true,
            id: matches[0].id,
            alt: matches[0].alt ?? '',
            filename,
          }
        : {
            found: false,
            reason: matches.length
              ? `${matches.length} Media documents are named ${filename}`
              : `no Media document is named ${filename}`,
          },
    )
  }
  return lookups
}

// --- Planning and saving ----------------------------------------------------------

/** A migrated article as the conversion needs it. */
export type LegacyArticle = {
  id: number | string
  slug: string
  title: string
  legacyHTML: string
  content: unknown
}

/**
 * Converts `article` and checks the result, writing nothing.
 *
 * `newId` is for tests that need stable output; a real run mints random ids.
 */
export async function planLegacyConversion(
  payload: Payload,
  article: LegacyArticle,
  access: ConversionAccess,
  newId?: () => string,
): Promise<{ report: ConversionReport; state: LexicalState }> {
  const refused: string[] = []
  if (!article.legacyHTML.trim()) {
    refused.push(
      'This article has no migrated Ghost HTML (`legacyHTML`) to convert.',
    )
  }
  if (!isEmptyRichText(article.content)) {
    refused.push(
      'Its rich-text body (`content`) already holds something, and is what the ' +
        'page renders. A conversion only ever fills an empty one.',
    )
  }

  const media = await resolveMedia(
    payload,
    imageSources(article.legacyHTML),
    access,
  )
  const conversion = convertLegacyHtml(article.legacyHTML, { media, newId })
  const { state } = conversion
  refused.push(...conversion.refusals)
  // What the converter refused is missing from its output, so the checks
  // below would only restate it as a difference. They still run, and the
  // report still shows what they found, but they refuse on their own only
  // when the converter thought it had represented everything.
  const converterRefused = conversion.refusals.length > 0

  const plainText = comparePlainText(article.legacyHTML, state, article.title)
  if (!plainText.equal && !converterRefused) {
    refused.push(
      'The converted text is not the migrated text. Around the first ' +
        `difference, the page reads "${plainText.firstDifference?.legacy}" ` +
        `and the conversion "${plainText.firstDifference?.converted}".`,
    )
  }

  const headingIds = compareHeadingIds(article.legacyHTML, state, article.title)
  if (!headingIds.equal && !converterRefused) {
    const wrong = headingIds.headings.filter(
      (h) => h.legacy !== null && h.legacy !== h.converted,
    )
    refused.push(
      wrong.length
        ? `Heading ids would change: ${wrong
            .map(
              (h) =>
                `#${h.legacy} → ${h.converted ? `#${h.converted}` : 'none'}`,
            )
            .join(', ')}.`
        : 'The converted body does not have the same headings as the migrated one.',
    )
  }

  const legacyHrefs = elements(article.legacyHTML)
    .filter((el) => el.tagName === 'a')
    .map((el) => attr(el, 'href') ?? '')
  const hrefs = convertedLinks(state)
  const links = {
    legacy: legacyHrefs.length,
    converted: hrefs.length,
    missing: without(legacyHrefs, hrefs),
    extra: without(hrefs, legacyHrefs),
  }
  if ((links.missing.length || links.extra.length) && !converterRefused) {
    refused.push(
      `Links differ: ${[
        ...links.missing.map((href) => `missing ${href}`),
        ...links.extra.map((href) => `extra ${href}`),
      ].join('; ')}.`,
    )
  }

  const legacyImages = elements(article.legacyHTML).filter(
    (el) =>
      el.tagName === 'img' &&
      !(
        (attr(el, 'class') ?? '').split(/\s+/).includes('kg-bookmark-icon') &&
        !attr(el, 'alt')
      ),
  ).length
  const images = {
    legacy: legacyImages,
    converted: convertedImageCount(state),
    placed: conversion.images,
  }
  if (images.legacy !== images.converted && !converterRefused) {
    refused.push(
      `The HTML has ${images.legacy} images and the conversion places ${images.converted}.`,
    )
  }

  const losses = markdownLosses(state)
  if (losses.length) {
    refused.push(
      `Markdown has no form for ${losses.join('; ')}. The editor can hold them, ` +
        'but the first revision through readArticleMarkdown and ' +
        'updateArticleMarkdown would flatten them, so the article is not ' +
        'converted until that can be kept.',
    )
  }
  const roundTrip = checkRoundTrip(payload, state)
  if (!roundTrip.unchanged && !losses.length) {
    refused.push(
      'The body would not survive readArticleMarkdown and updateArticleMarkdown ' +
        `unchanged: ${roundTrip.difference}.`,
    )
  }

  return {
    state,
    report: {
      id: article.id,
      slug: article.slug,
      convertible: refused.length === 0,
      refused,
      plainText,
      headingIds,
      links,
      images,
      roundTrip,
      cards: conversion.cards,
      notes: conversion.notes,
    },
  }
}

/**
 * Saves a planned conversion as a draft, and checks what landed.
 *
 * `content` and `_status` are the whole of the write, so `legacyHTML`, the
 * slug, the dates and everything else are carried forward from the newest
 * version untouched; `draft: true` means the live row — what readers get —
 * does not move. Returns the version this draft replaced, which is the way
 * back: restoring it (`restoreArticleVersion`, scope body) empties `content`
 * again, and the page renders from `legacyHTML` as before.
 */
export async function saveLegacyConversion(
  payload: Payload,
  article: LegacyArticle,
  state: LexicalState,
  access: ConversionAccess,
): Promise<{
  replacedVersion: string | null
  updated: Record<string, unknown>
}> {
  const user = access.req?.user as TypedUser | undefined
  const {
    docs: [replaced],
  } = await payload.findVersions({
    collection: 'posts',
    depth: 0,
    limit: 1,
    overrideAccess: access.overrideAccess,
    req: access.req,
    sort: '-updatedAt',
    user,
    where: { parent: { equals: article.id } },
  })

  const updated = (await payload.update({
    collection: 'posts',
    id: article.id,
    data: { _status: 'draft', content: state as never },
    depth: 0,
    draft: true,
    overrideAccess: access.overrideAccess,
    req: access.req,
    user,
  })) as unknown as Record<string, unknown>

  if (updated.legacyHTML !== article.legacyHTML) {
    throw new Error(
      'The draft came back with different `legacyHTML`, which a conversion ' +
        'never writes. Restore the previous version and report this.',
    )
  }
  if (isEmptyRichText(updated.content)) {
    throw new Error(
      'The draft was saved without the converted body: `content` came back ' +
        'empty, which is what Payload does with a field this user may not write.',
    )
  }
  return { replacedVersion: replaced ? String(replaced.id) : null, updated }
}
