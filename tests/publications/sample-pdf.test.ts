import { describe, expect, it } from 'vitest'

import { buildSamplePdf, samplePages } from '../../lib/publications/sample-pdf'

/** Every in-use cross-reference entry, as [object number, byte offset]. */
function xref(pdf: Buffer): Array<[number, number]> {
  const text = pdf.toString('latin1')
  const start = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(text)?.[1])
  const table = text.slice(start)
  const [, , count] = /^xref\n(\d+) (\d+)\n/.exec(table)!.map(Number)
  const entries = table.split('\n').slice(2, 2 + count!)
  return entries.flatMap((entry, id) =>
    entry.endsWith(' n ')
      ? [[id, Number(entry.slice(0, 10))] as [number, number]]
      : [],
  )
}

describe('buildSamplePdf', () => {
  it('writes a cross-reference table whose every offset lands on its object', () => {
    // A wrong offset is the bug a hand-written PDF makes; Poppler would
    // repair it with a warning, and the tests would pass over a broken file.
    const pdf = buildSamplePdf()
    const text = pdf.toString('latin1')
    const entries = xref(pdf)
    expect(entries.length).toBeGreaterThan(8)
    for (const [id, offset] of entries) {
      expect(text.startsWith(`${id} 0 obj\n`, offset)).toBe(true)
    }
  })

  it('gives every xref entry exactly twenty bytes', () => {
    const text = buildSamplePdf().toString('latin1')
    const table = text.slice(text.indexOf('xref\n'))
    for (const entry of table
      .split('\n')
      .slice(2)
      .filter((l) => /^\d{10} /.test(l))) {
      expect(`${entry}\n`).toHaveLength(20)
    }
  })

  it('says on every page that it is a sample, not an issue', () => {
    for (const page of samplePages(3)) {
      expect(page.lines.join(' ')).toMatch(/not an issue of Beyond Every Art/)
    }
  })

  it('escapes the characters a PDF string cannot hold bare', () => {
    const text = buildSamplePdf([
      { width: 100, height: 100, heading: 'a (b) c\\d', lines: [] },
    ]).toString('latin1')
    expect(text).toContain('(a \\(b\\) c\\\\d) Tj')
  })

  it('refuses text whose bytes would not be its characters', () => {
    expect(() =>
      buildSamplePdf([{ width: 100, height: 100, heading: 'café', lines: [] }]),
    ).toThrow(/printable ASCII/)
  })

  it('refuses a link to a page that does not exist', () => {
    expect(() =>
      buildSamplePdf([
        {
          width: 100,
          height: 100,
          heading: 'x',
          lines: [],
          links: [{ rect: [0, 0, 1, 1], page: 2 }],
        },
      ]),
    ).toThrow(/page 2/)
  })

  it('refuses an empty or fractional page count', () => {
    expect(() => samplePages(0)).toThrow(/whole number/)
    expect(() => samplePages(2.5)).toThrow(/whole number/)
    expect(() => buildSamplePdf([])).toThrow(/at least one page/)
  })
})
