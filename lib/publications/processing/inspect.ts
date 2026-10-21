// What Poppler and qpdf say about a PDF, read into plain data.
//
// Every function here takes a tool's output and returns values; nothing runs a
// process or touches a file. That keeps the parsing testable against output
// captured from the real tools, and keeps the part that does run them
// (`./tools.ts`) small enough to read in one go.
//
// The tools, and why these and not PDF.js, are in `docs/PUBLICATION_SYSTEM.md`
// under "PDF processing": `pdfinfo` for the page count, boxes, rotation and
// encryption; `pdftotext -bbox-layout` for words and where they sit; and qpdf's
// JSON for link annotations, which Poppler's command-line tools do not report.

import { classifyPublicationLink, type PublicationLink } from '../links'

import {
  type Bounds,
  displayedSize,
  normalizeDisplayRect,
  normalizeRect,
  type PdfRect,
  type Rotation,
  toRotation,
} from './geometry'

export type PageInfo = {
  /** 1-based. */
  number: number
  rotation: Rotation
  /** What the reader shows: the crop box, which defaults to the media box. */
  cropBox: PdfRect
  /** The displayed page in points, after rotation. */
  width: number
  height: number
}

export type DocumentInfo = {
  pageCount: number
  /**
   * True for a file with an owner password only: readable, with permission
   * flags Poppler reports but does not enforce on rendering. A file that needs
   * a password to open never gets this far — `pdfinfo` refuses it.
   */
  encrypted: boolean
  /** True when the file carries document JavaScript. Nothing here runs it. */
  javascript: boolean
  pages: PageInfo[]
}

function parseRect(text: string): PdfRect | null {
  const values = text.trim().split(/\s+/).map(Number)
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) {
    return null
  }
  return values as PdfRect
}

/**
 * Reads `pdfinfo -f 1 -l <last> -box <file>`.
 *
 * Throws when the output is not what a readable PDF produces, rather than
 * returning a document with pages missing: a page with no size cannot be laid
 * out, and the run should fail on it, not render around it.
 */
export function parsePdfInfo(stdout: string): DocumentInfo {
  const fields = new Map<string, string>()
  const pages = new Map<
    number,
    { rotation?: Rotation; mediaBox?: PdfRect; cropBox?: PdfRect }
  >()

  for (const line of stdout.split(/\r?\n/)) {
    const perPage = /^Page\s+(\d+)\s+(rot|MediaBox|CropBox):\s*(.*)$/.exec(line)
    if (perPage) {
      const number = Number(perPage[1])
      const entry = pages.get(number) ?? {}
      const [, , key, value] = perPage
      if (key === 'rot') entry.rotation = toRotation(Number(value))
      if (key === 'MediaBox') entry.mediaBox = parseRect(value!) ?? undefined
      if (key === 'CropBox') entry.cropBox = parseRect(value!) ?? undefined
      pages.set(number, entry)
      continue
    }
    const field = /^([A-Za-z][A-Za-z ]*?):\s*(.*)$/.exec(line)
    if (field && !fields.has(field[1]!)) fields.set(field[1]!, field[2]!)
  }

  const pageCount = Number(fields.get('Pages'))
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    throw new Error('pdfinfo reported no pages.')
  }

  const info: PageInfo[] = []
  for (let number = 1; number <= pageCount; number++) {
    const entry = pages.get(number)
    const box = entry?.cropBox ?? entry?.mediaBox
    if (!entry || entry.rotation === undefined || !box) {
      throw new Error(`pdfinfo reported no size for page ${number}.`)
    }
    const size = displayedSize(box, entry.rotation)
    if (size.width <= 0 || size.height <= 0) {
      throw new Error(`Page ${number} has no area.`)
    }
    info.push({ number, rotation: entry.rotation, cropBox: box, ...size })
  }

  return {
    pageCount,
    encrypted: /^yes\b/.test(fields.get('Encrypted') ?? ''),
    javascript: /^yes\b/.test(fields.get('JavaScript') ?? ''),
    pages: info,
  }
}

export type Word = Bounds & {
  text: string
  /** Which block and line of the page the word belongs to, in reading order. */
  block: number
  line: number
}

export type PageText = {
  /** Words joined by spaces, lines by newlines, blocks by a blank line. */
  text: string
  words: Word[]
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

function decodeEntities(text: string): string {
  return text.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (whole, name: string) => {
      if (name[0] === '#') {
        const code =
          name[1] === 'x' || name[1] === 'X'
            ? parseInt(name.slice(2), 16)
            : parseInt(name.slice(1), 10)
        return Number.isFinite(code) && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : ''
      }
      return ENTITIES[name.toLowerCase()] ?? whole
    },
  )
}

const attribute = (tag: string, name: string): number =>
  Number(new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1])

/**
 * Reads one page of `pdftotext -bbox-layout -cropbox`: XHTML with `<page>`,
 * `<block>`, `<line>` and `<word>` elements, positions in points from the
 * displayed page's top-left corner.
 *
 * The size to measure against comes from `pdfinfo`, not from the `<page>`
 * element: on a rotated page Poppler places the words on the turned page but
 * reports the page's width and height unturned, so a word on the right of a
 * landscape page would measure past the edge.
 *
 * Poppler writes this format and nothing else does, so a pattern over its
 * elements is enough; an XML parser would be a dependency for one caller.
 */
export function parseBboxLayout(
  xhtml: string,
  size: Pick<PageInfo, 'width' | 'height'>,
): PageText {
  if (!/<page\b[^>]*>/.test(xhtml)) return { text: '', words: [] }

  const words: Word[] = []
  const blocks: string[][] = []
  let block = -1
  let line = -1
  const tokens =
    /<block\b[^>]*>|<line\b[^>]*>|<word\b([^>]*)>([\s\S]*?)<\/word>/g
  for (let match = tokens.exec(xhtml); match; match = tokens.exec(xhtml)) {
    if (match[0].startsWith('<block')) {
      block += 1
      blocks.push([])
      continue
    }
    if (match[0].startsWith('<line')) {
      line += 1
      blocks[block]?.push('')
      continue
    }
    const text = decodeEntities(match[2]!).trim()
    if (!text) continue
    const tag = match[1]!
    const bounds = normalizeDisplayRect(
      {
        xMin: attribute(tag, 'xMin'),
        yMin: attribute(tag, 'yMin'),
        xMax: attribute(tag, 'xMax'),
        yMax: attribute(tag, 'yMax'),
      },
      size,
    )
    // A word outside a block or line would be malformed output; keep it in
    // the text rather than drop it, under the last structure seen.
    const lines = blocks[Math.max(0, block)] ?? (blocks[0] = [''])
    const index = lines.length - 1
    lines[index] = lines[index] ? `${lines[index]} ${text}` : text
    if (bounds)
      words.push({
        text,
        block: Math.max(0, block),
        line: Math.max(0, line),
        ...bounds,
      })
  }

  const text = blocks
    .map((lines) => lines.filter(Boolean).join('\n'))
    .filter(Boolean)
    .join('\n\n')
  return { text, words }
}

export type LinkTarget =
  /** A URI, as classified before it is stored (`lib/publications/links.ts`). */
  | { kind: 'uri'; uri: string; link: PublicationLink }
  /** Another page of the same issue, 1-based. */
  | { kind: 'page'; page: number }
  /** An action this site never renders: a launch, a script, a remote file. */
  | { kind: 'unsupported'; action: string }

export type ExtractedLink = {
  /** The page the link is drawn on, 1-based. */
  page: number
  bounds: Bounds
  target: LinkTarget
}

type QpdfValue = unknown
type QpdfObjects = Record<string, { value?: QpdfValue; stream?: unknown }>

const REF = /^(\d+) (\d+) R$/

/** The most name-tree nodes read from one file: far past any real export. */
const NAME_TREE_LIMIT = 10_000

/** qpdf's JSON v2 strings: `u:` for text, `b:` for hex bytes. Names keep `/`. */
function qpdfString(value: QpdfValue): string | null {
  if (typeof value !== 'string') return null
  if (value.startsWith('u:')) return value.slice(2)
  if (value.startsWith('b:')) {
    const hex = value.slice(2)
    if (!/^(?:[0-9a-f]{2})*$/i.test(hex)) return null
    return Buffer.from(hex, 'hex').toString('latin1')
  }
  return null
}

/**
 * Reads link annotations from `qpdf --json=2 --json-key=pages --json-key=qpdf`.
 *
 * Internal links resolve to a page number whether the PDF names its
 * destination or spells it out, because a designer's export does either. A
 * destination that does not resolve is dropped rather than guessed at.
 */
export function extractLinks(
  json: unknown,
  pages: PageInfo[],
  siteUrl?: string,
): ExtractedLink[] {
  const doc = json as {
    pages?: Array<{ object?: string }>
    qpdf?: [unknown, QpdfObjects]
  }
  const objects = doc.qpdf?.[1] ?? {}

  const resolve = (value: QpdfValue, depth = 0): QpdfValue => {
    if (depth > 32) return null
    if (typeof value === 'string' && REF.test(value)) {
      const target = objects[`obj:${value}`]
      return target ? resolve(target.value ?? null, depth + 1) : null
    }
    return value
  }
  const dict = (value: QpdfValue): Record<string, QpdfValue> | null => {
    const resolved = resolve(value)
    return resolved && typeof resolved === 'object' && !Array.isArray(resolved)
      ? (resolved as Record<string, QpdfValue>)
      : null
  }
  const array = (value: QpdfValue): QpdfValue[] | null => {
    const resolved = resolve(value)
    return Array.isArray(resolved) ? resolved : null
  }

  const pageRefs = new Map<string, number>()
  ;(doc.pages ?? []).forEach((page, index) => {
    if (page.object) pageRefs.set(page.object, index + 1)
  })

  // The document catalog is the trailer's /Root. Looking for an object that
  // calls itself /Type /Catalog instead found the wrong one in a file still
  // holding an older catalog from an earlier save, and none in a file whose
  // catalog omits /Type — both of which Poppler and qpdf read without a word —
  // and every named link to another page was dropped.
  const trailer = objects['trailer']?.value as
    Record<string, QpdfValue> | undefined
  const catalog =
    dict(trailer?.['/Root'] ?? null) ??
    dict(
      Object.values(objects).find((object) => {
        const value = object.value as Record<string, QpdfValue> | undefined
        return (
          value && typeof value === 'object' && value['/Type'] === '/Catalog'
        )
      })?.value ?? null,
    )

  // Named destinations live in the catalog's /Names /Dests tree (PDF 1.2+)
  // or its older /Dests dictionary. The tree is read once, into a map: each
  // node at most once and no more than NAME_TREE_LIMIT of them, because a
  // file can list a node among its own kids, and searching such a tree for
  // each link took longer than any run could wait — a 700-byte PDF hung link
  // extraction with no timeout able to stop it, since this runs in-process.
  let named: Map<string, QpdfValue> | null = null
  const namedDestinations = (): Map<string, QpdfValue> => {
    if (named) return named
    const found = new Map<string, QpdfValue>()
    const seen = new Set<string>()
    let budget = NAME_TREE_LIMIT
    const walk = (node: QpdfValue, depth: number) => {
      if (depth > 32 || budget <= 0) return
      budget -= 1
      if (typeof node === 'string' && REF.test(node)) {
        if (seen.has(node)) return
        seen.add(node)
      }
      const entry = dict(node)
      if (!entry) return
      const names = array(entry['/Names'])
      if (names) {
        for (let i = 0; i + 1 < names.length; i += 2) {
          const key = qpdfString(names[i])
          if (key !== null && !found.has(key)) found.set(key, names[i + 1])
        }
      }
      for (const kid of array(entry['/Kids']) ?? []) walk(kid, depth + 1)
    }
    walk(dict(catalog?.['/Names'] ?? null)?.['/Dests'] ?? null, 0)
    named = found
    return found
  }
  const lookupName = (name: string): QpdfValue => {
    const old = dict(catalog?.['/Dests'] ?? null)
    if (old && `/${name}` in old) return old[`/${name}`]
    return namedDestinations().get(name) ?? null
  }

  const destinationPage = (dest: QpdfValue, depth = 0): number | null => {
    if (depth > 4) return null
    const resolved = resolve(dest)
    if (Array.isArray(resolved)) {
      const first = resolved[0]
      if (typeof first === 'string' && REF.test(first))
        return pageRefs.get(first) ?? null
      // A remote-style destination gives a 0-based page index instead.
      if (typeof first === 'number' && Number.isInteger(first)) {
        return first >= 0 && first < pages.length ? first + 1 : null
      }
      return null
    }
    const asDict = dict(resolved)
    if (asDict && '/D' in asDict)
      return destinationPage(asDict['/D'], depth + 1)
    const name =
      typeof resolved === 'string' && resolved.startsWith('/')
        ? resolved.slice(1)
        : qpdfString(resolved)
    return name === null ? null : destinationPage(lookupName(name), depth + 1)
  }

  const links: ExtractedLink[] = []
  for (const info of pages) {
    const ref = doc.pages?.[info.number - 1]?.object
    const page = ref ? dict(ref) : null
    for (const annotation of array(page?.['/Annots']) ?? []) {
      const annot = dict(annotation)
      if (!annot || annot['/Subtype'] !== '/Link') continue
      const rect = array(annot['/Rect'])
      if (!rect || rect.length !== 4 || rect.some((n) => typeof n !== 'number'))
        continue
      const bounds = normalizeRect(rect as PdfRect, info.cropBox, info.rotation)
      if (!bounds) continue

      let target: LinkTarget | null = null
      const action = dict(annot['/A'])
      if (action) {
        const kind = action['/S']
        if (kind === '/URI') {
          const uri = qpdfString(resolve(action['/URI'])) ?? ''
          target = {
            kind: 'uri',
            uri,
            link: classifyPublicationLink(uri, siteUrl),
          }
        } else if (kind === '/GoTo') {
          const number = destinationPage(action['/D'])
          if (number !== null) target = { kind: 'page', page: number }
        } else if (typeof kind === 'string') {
          target = { kind: 'unsupported', action: kind.slice(1) }
        }
      } else if ('/Dest' in annot) {
        const number = destinationPage(annot['/Dest'])
        if (number !== null) target = { kind: 'page', page: number }
      }
      if (target) links.push({ page: info.number, bounds, target })
    }
  }
  return links
}
