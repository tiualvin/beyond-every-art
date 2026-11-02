import { describe, expect, it } from 'vitest'

import { toAltText } from '../../lib/content/media'
import {
  isUsableAlt,
  parseAltCsv,
  planAltRepair,
  type AltRow,
  type MediaDoc,
} from '../../lib/media/alt-text'

const doc = (
  id: number,
  alt: string | null,
  filename = `photo-${id}.jpeg`,
): MediaDoc => ({
  id,
  alt,
  filename,
})

/** The state the migration left: Ghost wrote the file name into `alt`. */
const migrated = (id: number): MediaDoc => doc(id, `photo-${id}.jpeg`)

describe('parseAltCsv', () => {
  it('reads the media_id and alt columns by name', () => {
    const { rows } = parseAltCsv(
      'media_id,alt\n30,A purple painting.\n26,A red one.\n',
    )
    expect(rows).toEqual([
      { id: 30, alt: 'A purple painting.' },
      { id: 26, alt: 'A red one.' },
    ])
  })

  it('accepts a bare id column', () => {
    const { rows } = parseAltCsv('id,alt\n7,Something.\n')
    expect(rows).toEqual([{ id: 7, alt: 'Something.' }])
  })

  it('keeps a quoted alt together across commas, quotes and newlines', () => {
    // The real file is written by a script and an alt describing a picture can
    // legitimately contain all three.
    const csv =
      'media_id,alt,notes\n' +
      '12,"Brushstrokes of teal, magenta and ""light"" pink.","A note, with a comma"\n' +
      '13,"Two lines\nof text"\n'
    const { rows } = parseAltCsv(csv)
    expect(rows).toEqual([
      { id: 12, alt: 'Brushstrokes of teal, magenta and "light" pink.' },
      { id: 13, alt: 'Two lines\nof text' },
    ])
  })

  it('rejects a file whose header names neither column', () => {
    const { rows, rejected } = parseAltCsv('slug,description\na,B\n')
    expect(rows).toEqual([])
    expect(rejected[0].reason).toMatch(/media_id/)
  })

  it('reports a row with an id but no text rather than dropping it silently', () => {
    const { rows, rejected } = parseAltCsv('media_id,alt\n5,\n6,Fine.\n')
    expect(rows).toEqual([{ id: 6, alt: 'Fine.' }])
    expect(rejected).toEqual([{ line: 2, reason: 'media 5 has no alt text' }])
  })

  it('treats a trailing blank line as the end of the file, not an error', () => {
    const { rows, rejected } = parseAltCsv('media_id,alt\n5,Fine.\n\n')
    expect(rows).toHaveLength(1)
    expect(rejected).toEqual([])
  })
})

describe('isUsableAlt', () => {
  it('accepts a description', () => {
    expect(
      isUsableAlt('A dish of indigo pigment on slate.', 'photo-1.jpeg'),
    ).toBe(true)
  })

  it('refuses the file name, which is the whole fault being repaired', () => {
    // The same check the template applies. If this returns true for a file
    // name, the repair would write text and the page would still render
    // alt="" — the write would look like a success and change nothing.
    expect(
      isUsableAlt('photo-1616001089004.jpeg', 'photo-1616001089004.jpeg'),
    ).toBe(false)
    expect(
      toAltText('photo-1616001089004.jpeg', 'photo-1616001089004.jpeg'),
    ).toBe('')
  })

  it('refuses blank and whitespace-only text', () => {
    expect(isUsableAlt('', 'photo-1.jpeg')).toBe(false)
    expect(isUsableAlt('   ', 'photo-1.jpeg')).toBe(false)
  })
})

describe('planAltRepair', () => {
  const rows = (pairs: [number, string][]): AltRow[] =>
    pairs.map(([id, alt]) => ({ id, alt }))

  it('plans an update for a record whose alt is its file name', () => {
    const plan = planAltRepair(
      [migrated(30)],
      rows([[30, 'Blended washes of purple.']]),
    )
    expect(plan.updates).toEqual([
      {
        id: 30,
        filename: 'photo-30.jpeg',
        before: 'photo-30.jpeg',
        after: 'Blended washes of purple.',
      },
    ])
    expect(plan.refused).toEqual([])
  })

  it('writes nothing when the text is already what is stored', () => {
    // Rerunning the repair must be a no-op, which is what makes it safe to run
    // twice by accident.
    const already = doc(30, 'Blended washes of purple.')
    const plan = planAltRepair(
      [already],
      rows([[30, 'Blended washes of purple.']]),
    )
    expect(plan.updates).toEqual([])
    expect(plan.unchanged).toHaveLength(1)
  })

  it('refuses a proposal the site would discard instead of writing it', () => {
    const plan = planAltRepair([migrated(30)], rows([[30, 'photo-30.jpeg']]))
    expect(plan.updates).toEqual([])
    expect(plan.refused).toHaveLength(1)
    expect(plan.refused[0].reason).toMatch(/toAltText/)
  })

  it('does not report a file name as "unchanged", which is the state it must fix', () => {
    // The migrated records already hold their file name. Proposed that same
    // value, the honest answer is a refusal — calling it unchanged would print
    // a clean line for every page still rendering alt="".
    const plan = planAltRepair([migrated(30)], rows([[30, 'photo-30.jpeg']]))
    expect(plan.unchanged).toEqual([])
    expect(plan.refused).toHaveLength(1)
  })

  it('reports an id with no media record rather than inventing one', () => {
    const plan = planAltRepair([migrated(30)], rows([[999, 'Nowhere.']]))
    expect(plan.updates).toEqual([])
    expect(plan.unknown).toEqual([999])
  })

  it('lists the media records no proposal addressed, and plans nothing for them', () => {
    const plan = planAltRepair(
      [migrated(30), migrated(31)],
      rows([[30, 'Purple.']]),
    )
    expect(plan.updates.map((u) => u.id)).toEqual([30])
    expect(plan.unaddressed).toEqual([{ id: 31, filename: 'photo-31.jpeg' }])
  })

  it('puts every proposal in exactly one bucket', () => {
    const docs = [
      migrated(1),
      migrated(2),
      doc(3, 'Already right.'),
      migrated(4),
    ]
    const plan = planAltRepair(
      docs,
      rows([
        [1, 'A new description.'],
        [2, 'photo-2.jpeg'],
        [3, 'Already right.'],
        [99, 'Unknown id.'],
      ]),
    )
    const seen = [
      ...plan.updates.map((u) => u.id),
      ...plan.refused.map((r) => r.id),
      ...plan.unchanged.map((u) => u.id),
      ...plan.unknown,
    ]
    expect(seen.sort()).toEqual([1, 2, 3, 99])
    expect(plan.unaddressed.map((u) => u.id)).toEqual([4])
  })

  it('carries the frozen fields nowhere: an update holds only the text', () => {
    // The guard that protects the image is that the write payload is built from
    // `after` alone. If an update ever grew a `url` or a `filename`, this is
    // the assertion that would fail first.
    const record: MediaDoc & { url: string } = {
      id: 1,
      alt: 'photo-1.jpeg',
      filename: 'photo-1.jpeg',
      url: '/api/media/file/photo-1.jpeg',
    }
    const plan = planAltRepair([record], rows([[1, 'A description.']]))
    expect(Object.keys(plan.updates[0]).sort()).toEqual([
      'after',
      'before',
      'filename',
      'id',
    ])
  })
})
