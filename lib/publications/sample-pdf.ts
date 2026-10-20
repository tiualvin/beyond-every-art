// A PDF to process before there is a real one.
//
// No issue exists yet (`docs/PUBLICATION_SYSTEM.md`, open decision 1), and a
// processing pipeline tested only against mocks of Poppler would be tested
// against what someone believed Poppler does. This writes a small, valid PDF by
// hand — no dependency, every byte accounted for — that carries the things
// processing has to get right: several pages, a page of a different size and
// orientation, text in known places, a link to another site, a link to this
// one, a link to another page of the same issue, and a link no reader should
// ever be offered.
//
// It is a fixture, not a publication. The text says so on every page, so a
// sample processed onto a real server cannot be mistaken for an issue.

export type SamplePage = {
  /** Points; 72 to the inch. A4 portrait is 595 × 842. */
  width: number
  height: number
  heading: string
  lines: string[]
  /** Link annotations on this page, each a rectangle in PDF points. */
  links?: SampleLink[]
  /** `/Rotate`: how a viewer turns the page, clockwise. */
  rotate?: 0 | 90 | 180 | 270
  /**
   * Points trimmed from every edge by a `/CropBox`, as a print file with bleed
   * has. The reader shows the crop box, so positions are measured within it.
   */
  bleed?: number
}

export type SampleLink =
  | { rect: [number, number, number, number]; uri: string }
  /** A link to another page of the same document, 1-based. */
  | { rect: [number, number, number, number]; page: number }

const A4: Pick<SamplePage, 'width' | 'height'> = { width: 595, height: 842 }

/**
 * The default sample: eight pages, the fifth landscape, with one of each kind
 * of link processing has to sort (`lib/publications/links.ts`).
 */
export function samplePages(
  pageCount = 8,
  title = 'Sample issue',
): SamplePage[] {
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    throw new Error(
      `A sample needs a whole number of pages, from 1; got ${pageCount}.`,
    )
  }
  return Array.from({ length: pageCount }, (_, index) => {
    const number = index + 1
    const landscape = number === 5
    const size = landscape ? { width: A4.height, height: A4.width } : A4
    const page: SamplePage = {
      ...size,
      heading: number === 1 ? title : `${title}, page ${number}`,
      lines: [
        'A generated sample for testing publication processing.',
        'It is not an issue of Beyond Every Art.',
        `This is page ${number} of ${pageCount}.`,
      ],
    }
    if (number === 2) {
      page.lines.push(
        'Links: an outside site, this site, page 3, and a refused one.',
      )
      page.links = [
        { rect: [72, 600, 300, 620], uri: 'https://example.com/exhibition/' },
        {
          rect: [72, 570, 300, 590],
          uri: 'https://www.beyondeveryart.com/about/',
        },
        { rect: [72, 540, 300, 560], page: Math.min(3, pageCount) },
        { rect: [72, 510, 300, 530], uri: 'javascript:alert(1)' },
      ]
    }
    return page
  })
}

/** Escapes a string for a PDF literal: backslash and both parentheses. */
function literal(text: string): string {
  if (/[^\x20-\x7e]/.test(text)) {
    throw new Error(
      'Sample text is printable ASCII only, so its bytes are its characters.',
    )
  }
  return `(${text.replace(/[\\()]/g, (char) => `\\${char}`)})`
}

function contentStream(page: SamplePage, number: number): string {
  const top = page.height - 72
  const ops = [
    // A pale panel behind the heading, so a rendered page is not all white and
    // an image comparison has something to compare.
    '0.93 0.91 0.87 rg',
    `36 ${top - 30} ${page.width - 72} 60 re f`,
    '0 0 0 rg',
    'BT',
    '/F1 24 Tf',
    `72 ${top} Td`,
    `${literal(page.heading)} Tj`,
    '/F1 12 Tf',
    '0 -48 Td',
    ...page.lines.flatMap((line) => [`${literal(line)} Tj`, '0 -18 Td']),
    'ET',
    'BT',
    '/F1 10 Tf',
    `${page.width / 2 - 6} 36 Td`,
    `${literal(String(number))} Tj`,
    'ET',
  ]
  return ops.join('\n')
}

/**
 * Writes the pages as a PDF 1.7 file.
 *
 * Objects are numbered in the order they are written: the catalog, the page
 * tree, the font, then for each page its page object, its content stream and
 * its link annotations. The cross-reference table is built from the byte
 * offset of each object as written, which is why everything is ASCII.
 */
export function buildSamplePdf(pages: SamplePage[] = samplePages()): Buffer {
  if (pages.length === 0) throw new Error('A PDF needs at least one page.')

  const CATALOG = 1
  const PAGES = 2
  const FONT = 3
  let next = 4
  const layout = pages.map((page) => {
    const pageId = next++
    const contentId = next++
    const annotIds = (page.links ?? []).map(() => next++)
    return { page, pageId, contentId, annotIds }
  })

  const objects = new Map<number, string>()
  objects.set(CATALOG, `<< /Type /Catalog /Pages ${PAGES} 0 R >>`)
  objects.set(
    PAGES,
    `<< /Type /Pages /Kids [${layout.map((l) => `${l.pageId} 0 R`).join(' ')}] /Count ${pages.length} >>`,
  )
  objects.set(
    FONT,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  )

  layout.forEach(({ page, pageId, contentId, annotIds }, index) => {
    const annots = annotIds.length
      ? ` /Annots [${annotIds.map((id) => `${id} 0 R`).join(' ')}]`
      : ''
    const rotate = page.rotate ? ` /Rotate ${page.rotate}` : ''
    const bleed = page.bleed ?? 0
    const crop = bleed
      ? ` /CropBox [${bleed} ${bleed} ${page.width - bleed} ${page.height - bleed}]`
      : ''
    objects.set(
      pageId,
      `<< /Type /Page /Parent ${PAGES} 0 R /MediaBox [0 0 ${page.width} ${page.height}]${crop}${rotate}` +
        ` /Resources << /Font << /F1 ${FONT} 0 R >> >> /Contents ${contentId} 0 R${annots} >>`,
    )
    const stream = contentStream(page, index + 1)
    objects.set(
      contentId,
      `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    )
    ;(page.links ?? []).forEach((link, linkIndex) => {
      const rect = `[${link.rect.join(' ')}]`
      let action: string
      if ('uri' in link) {
        action = `/A << /S /URI /URI ${literal(link.uri)} >>`
      } else {
        const target = layout[link.page - 1]
        if (!target)
          throw new Error(
            `A link points at page ${link.page}, which does not exist.`,
          )
        action = `/Dest [${target.pageId} 0 R /Fit]`
      }
      objects.set(
        annotIds[linkIndex]!,
        `<< /Type /Annot /Subtype /Link /Rect ${rect} /Border [0 0 0] ${action} >>`,
      )
    })
  })

  // The second line is the conventional binary marker, so tools treat the file
  // as binary; it is the only non-ASCII in the file and comes before any offset.
  const header = '%PDF-1.7\n%\xe2\xe3\xcf\xd3\n'
  let body = header
  const offsets: number[] = []
  const count = next - 1
  for (let id = 1; id <= count; id++) {
    offsets[id] = Buffer.byteLength(body, 'latin1')
    body += `${id} 0 obj\n${objects.get(id)}\nendobj\n`
  }
  const xrefAt = Buffer.byteLength(body, 'latin1')
  // Each entry is exactly 20 bytes, its end of line included.
  const entries = ['0000000000 65535 f \n']
  for (let id = 1; id <= count; id++) {
    entries.push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`)
  }
  body +=
    `xref\n0 ${count + 1}\n${entries.join('')}` +
    `trailer\n<< /Size ${count + 1} /Root ${CATALOG} 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`

  return Buffer.from(body, 'latin1')
}
