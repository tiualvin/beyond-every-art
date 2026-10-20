import { describe, expect, it } from 'vitest'

import {
  extractLinks,
  parseBboxLayout,
  parsePdfInfo,
  type PageInfo,
} from '../../../lib/publications/processing/inspect'

const SITE = 'https://www.beyondeveryart.com'

// Captured from `pdfinfo -f 1 -l 99999 -box` (Poppler 24.02) on the sample in
// lib/publications/sample-pdf.ts, trimmed to two pages and given a title with
// a colon in it, which the field pattern must not split on.
const PDFINFO = `Title:           Spring: an issue
Custom Metadata: no
JavaScript:      no
Pages:           2
Encrypted:       no
Page    1 size:  595 x 842 pts (A4)
Page    1 rot:   0
Page    2 size:  842 x 595 pts (A4)
Page    2 rot:   90
Page    1 MediaBox:      0.00     0.00   595.00   842.00
Page    1 CropBox:       0.00     0.00   595.00   842.00
Page    2 MediaBox:      0.00     0.00   595.00   842.00
Page    2 CropBox:      20.00    20.00   575.00   822.00
File size:       5358 bytes
PDF version:     1.7
`

describe('parsePdfInfo', () => {
  it('reads the page count and each page as displayed', () => {
    const info = parsePdfInfo(PDFINFO)
    expect(info.pageCount).toBe(2)
    expect(info.encrypted).toBe(false)
    expect(info.javascript).toBe(false)
    expect(info.pages[0]).toEqual({
      number: 1,
      rotation: 0,
      cropBox: [0, 0, 595, 842],
      width: 595,
      height: 842,
    })
    // Turned a quarter, and measured within its crop box.
    expect(info.pages[1]).toEqual({
      number: 2,
      rotation: 90,
      cropBox: [20, 20, 575, 822],
      width: 802,
      height: 555,
    })
  })

  it('reports an owner-password file as encrypted but readable', () => {
    const info = parsePdfInfo(
      PDFINFO.replace(
        'Encrypted:       no',
        'Encrypted:       yes (print:no copy:yes change:yes addNotes:yes algorithm:AES-256)',
      ),
    )
    expect(info.encrypted).toBe(true)
  })

  it('notices document JavaScript', () => {
    expect(
      parsePdfInfo(
        PDFINFO.replace('JavaScript:      no', 'JavaScript:      yes'),
      ).javascript,
    ).toBe(true)
  })

  it('fails rather than lay out a page it has no size for', () => {
    expect(() => parsePdfInfo('Pages: 0\n')).toThrow(/no pages/)
    expect(() => parsePdfInfo(PDFINFO.replace(/^Page\s+2 .*$/gm, ''))).toThrow(
      /no size for page 2/,
    )
  })
})

const PAGE: Pick<PageInfo, 'width' | 'height'> = { width: 595, height: 842 }

// Captured from `pdftotext -bbox-layout -cropbox`, with entities added.
const BBOX = `<!DOCTYPE html><html><head></head><body>
<doc>
  <page width="595.000000" height="842.000000">
    <flow>
      <block xMin="72" yMin="54.768" xMax="302.784" yMax="76.968">
        <line xMin="72" yMin="54.768" xMax="302.784" yMax="76.968">
          <word xMin="72.000000" yMin="54.768000" xMax="153.360000" yMax="76.968000">Fish &amp; Chips</word>
          <word xMin="160.032000" yMin="54.768000" xMax="222.720000" yMax="76.968000">&lt;draft&gt;</word>
        </line>
      </block>
      <block xMin="72" yMin="111" xMax="381" yMax="176">
        <line xMin="72" yMin="111" xMax="360" yMax="122">
          <word xMin="72" yMin="111" xMax="80" yMax="122">caf&#xe9;</word>
        </line>
        <line xMin="72" yMin="129" xMax="272" yMax="140">
          <word xMin="72" yMin="129" xMax="78" yMax="140">&#8220;Two&#8221;</word>
        </line>
      </block>
    </flow>
  </page>
</doc></body></html>`

describe('parseBboxLayout', () => {
  it('keeps the reading order as text: lines, then blank lines between blocks', () => {
    expect(parseBboxLayout(BBOX, PAGE).text).toBe(
      'Fish & Chips <draft>\n\ncafé\n“Two”',
    )
  })

  it('places each word on the page, with its block and line', () => {
    const { words } = parseBboxLayout(BBOX, PAGE)
    expect(words).toHaveLength(4)
    expect(words[0]).toEqual({
      text: 'Fish & Chips',
      block: 0,
      line: 0,
      x: 0.121,
      y: 0.065,
      width: 0.1367,
      height: 0.0264,
    })
    expect(words.map((word) => [word.block, word.line])).toEqual([
      [0, 0],
      [0, 0],
      [1, 1],
      [1, 2],
    ])
  })

  it('measures against the size it is given, not the page element', () => {
    // On a turned page Poppler reports the page unturned; the words are on
    // the turned page, so a landscape width is what makes them fit.
    const landscape = parseBboxLayout(BBOX, { width: 842, height: 595 })
      .words[0]!
    expect(landscape.x).toBeCloseTo(72 / 842, 4)
  })

  it('returns nothing for a page with no text layer', () => {
    expect(
      parseBboxLayout('<doc><page width="1" height="1"></page></doc>', PAGE),
    ).toEqual({
      text: '',
      words: [],
    })
    expect(parseBboxLayout('', PAGE)).toEqual({ text: '', words: [] })
  })
})

const PAGES: PageInfo[] = [
  {
    number: 1,
    rotation: 0,
    cropBox: [0, 0, 595, 842],
    width: 595,
    height: 842,
  },
  {
    number: 2,
    rotation: 0,
    cropBox: [0, 0, 595, 842],
    width: 595,
    height: 842,
  },
]

/** The shape of `qpdf --json=2 --json-key=pages --json-key=qpdf`. */
function qpdf(objects: Record<string, unknown>) {
  return {
    version: 2,
    pages: [{ object: '3 0 R' }, { object: '4 0 R' }],
    qpdf: [
      { jsonversion: 2 },
      Object.fromEntries(
        Object.entries({
          '1 0 R': {
            '/Type': '/Catalog',
            '/Names': { '/Dests': '20 0 R' },
            '/Dests': { '/Old': ['4 0 R', '/Fit'] },
          },
          '20 0 R': { '/Kids': ['21 0 R'] },
          '21 0 R': { '/Names': ['u:chapter-2', '22 0 R'] },
          '22 0 R': { '/D': ['4 0 R', '/XYZ', 0, 842, 0] },
          ...objects,
        }).map(([ref, value]) => [`obj:${ref}`, { value }]),
      ),
    ],
  }
}

const link = (extra: Record<string, unknown>) => ({
  '/Type': '/Annot',
  '/Subtype': '/Link',
  '/Rect': [59.5, 673.6, 178.5, 757.8],
  ...extra,
})

describe('extractLinks', () => {
  it('classifies a URI before it is stored', () => {
    const links = extractLinks(
      qpdf({
        '3 0 R': { '/Annots': ['10 0 R', '11 0 R', '12 0 R'] },
        '4 0 R': {},
        '10 0 R': link({
          '/A': { '/S': '/URI', '/URI': 'u:https://example.com/a/' },
        }),
        '11 0 R': link({ '/A': '13 0 R' }),
        '13 0 R': { '/S': '/URI', '/URI': 'u:http://beyondeveryart.com/about' },
        // Hex bytes, as some exporters write strings.
        '12 0 R': link({
          '/A': {
            '/S': '/URI',
            '/URI': `b:${Buffer.from('javascript:void(0)').toString('hex')}`,
          },
        }),
      }),
      PAGES,
      SITE,
    )
    expect(links.map((each) => each.target)).toEqual([
      {
        kind: 'uri',
        uri: 'https://example.com/a/',
        link: { kind: 'external', href: 'https://example.com/a/' },
      },
      {
        kind: 'uri',
        uri: 'http://beyondeveryart.com/about',
        link: { kind: 'internal', href: '/about/' },
      },
      {
        kind: 'uri',
        uri: 'javascript:void(0)',
        link: { kind: 'refused', reason: 'scheme' },
      },
    ])
    expect(links[0]).toMatchObject({
      page: 1,
      bounds: { x: 0.1, y: 0.1, width: 0.2, height: 0.1 },
    })
  })

  it('resolves a link to another page however the PDF spells it', () => {
    const links = extractLinks(
      qpdf({
        '3 0 R': {
          '/Annots': [
            link({ '/Dest': ['4 0 R', '/Fit'] }),
            link({ '/A': { '/S': '/GoTo', '/D': ['4 0 R', '/Fit'] } }),
            link({ '/Dest': 'u:chapter-2' }),
            link({ '/Dest': '/Old' }),
            link({ '/A': { '/S': '/GoTo', '/D': 'u:chapter-2' } }),
          ],
        },
        '4 0 R': {},
      }),
      PAGES,
      SITE,
    )
    expect(links.map((each) => each.target)).toEqual(
      Array(5).fill({ kind: 'page', page: 2 }),
    )
  })

  it('drops a destination it cannot resolve rather than guess', () => {
    const links = extractLinks(
      qpdf({
        '3 0 R': {
          '/Annots': [
            link({ '/Dest': 'u:missing' }),
            link({ '/Dest': ['99 0 R', '/Fit'] }),
          ],
        },
        '4 0 R': {},
      }),
      PAGES,
      SITE,
    )
    expect(links).toEqual([])
  })

  it('keeps an action it will never render, so an editor can see it was there', () => {
    const links = extractLinks(
      qpdf({
        '3 0 R': {
          '/Annots': [
            link({ '/A': { '/S': '/Launch', '/F': 'u:calc.exe' } }),
            link({ '/A': { '/S': '/JavaScript', '/JS': 'u:app.alert(1)' } }),
            link({ '/A': { '/S': '/GoToR', '/F': 'u:other.pdf' } }),
          ],
        },
        '4 0 R': {},
      }),
      PAGES,
      SITE,
    )
    expect(links.map((each) => each.target)).toEqual([
      { kind: 'unsupported', action: 'Launch' },
      { kind: 'unsupported', action: 'JavaScript' },
      { kind: 'unsupported', action: 'GoToR' },
    ])
  })

  it('ignores annotations that are not links, and links off the page', () => {
    const links = extractLinks(
      qpdf({
        '3 0 R': {
          '/Annots': [
            { '/Subtype': '/Text', '/Rect': [0, 0, 10, 10] },
            link({ '/Rect': [-50, 0, -10, 40], '/Dest': ['4 0 R'] }),
            link({ '/Rect': [0, 0, 10], '/Dest': ['4 0 R'] }),
          ],
        },
        '4 0 R': {},
      }),
      PAGES,
      SITE,
    )
    expect(links).toEqual([])
  })

  it('survives a reference loop', () => {
    expect(
      extractLinks(
        qpdf({
          '3 0 R': { '/Annots': '30 0 R' },
          '4 0 R': {},
          '30 0 R': '31 0 R',
          '31 0 R': '30 0 R',
        }),
        PAGES,
        SITE,
      ),
    ).toEqual([])
  })
})
