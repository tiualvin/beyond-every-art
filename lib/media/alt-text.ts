// Planning the alt-text repair for migrated media.
//
// The migration left 109 media records carrying Ghost's fallback for a missing
// alt attribute — the upload's file name. `toAltText` blanks those on purpose
// (a screen reader announcing `photo-1616001089004.jpeg` is worse than
// announcing nothing), so the rendered page has `alt=""`, the image is
// decorative to assistive technology, image search is given nothing to work
// with, and `og:image:alt` is omitted for want of a value.
//
// The words have to come from somewhere that can see the photograph. This
// module does not write anything or call a model: it takes a file of proposed
// alt text and decides, per record, whether the proposal is one the site would
// actually use. Pure so the decisions are unit tested and the CLI stays a
// loop around `payload.update`.
//
// **The rule that matters.** A proposal that `toAltText` would blank is refused
// here rather than written, because writing it would silently reproduce the
// exact fault being repaired — the field would hold text and the page would
// still render `alt=""`. Checking the proposal with the same function the
// template uses is the only way to be sure the two agree.

import { toAltText } from '../content/media'

/** The fields of a media record this needs. Nothing else is read or written. */
export interface MediaDoc {
  id: number | string
  alt?: unknown
  filename?: unknown
}

/** One proposed description, keyed to the media record it belongs to. */
export interface AltRow {
  id: number | string
  alt: string
}

export interface AltUpdate {
  id: number | string
  filename: string
  before: string
  after: string
}

export interface AltRefusal {
  id: number | string
  alt: string
  reason: string
}

export interface AltPlan {
  updates: AltUpdate[]
  /** Already carrying this exact text. Rerunning a repair is a no-op. */
  unchanged: AltUpdate[]
  refused: AltRefusal[]
  /** Proposed ids with no media record behind them. */
  unknown: (number | string)[]
  /** Media records with no proposal. Reported, never touched. */
  unaddressed: { id: number | string; filename: string }[]
}

export interface ParseResult {
  rows: AltRow[]
  /** Lines that could not be read at all, with the reason. */
  rejected: { line: number; reason: string }[]
}

/**
 * Above this the text is not an alternative to an image any more. Nothing is
 * refused for it — long alt text is untidy, not wrong — but it is worth saying
 * out loud in the report.
 */
export const LONG_ALT = 200

/**
 * Read a CSV of proposals.
 *
 * Header-driven and deliberately small, because the file is produced by a
 * person or a script and checked before it is used: `media_id` (or `id`) and
 * `alt` are looked up by name, extra columns are ignored, and a quoted field
 * may hold commas, quotes (`""`) and newlines — which an `alt` describing a
 * picture legitimately can.
 */
export function parseAltCsv(text: string): ParseResult {
  const rows: AltRow[] = []
  const rejected: ParseResult['rejected'] = []

  const records = splitCsv(text)
  if (records.length === 0)
    return { rows, rejected: [{ line: 0, reason: 'empty file' }] }

  const header = records[0].fields.map((f) => f.trim().toLowerCase())
  const idAt = header.includes('media_id')
    ? header.indexOf('media_id')
    : header.indexOf('id')
  const altAt = header.indexOf('alt')

  if (idAt === -1 || altAt === -1) {
    return {
      rows,
      rejected: [
        {
          line: 1,
          reason:
            'header must name a media_id (or id) column and an alt column',
        },
      ],
    }
  }

  for (const record of records.slice(1)) {
    const rawId = (record.fields[idAt] ?? '').trim()
    const alt = (record.fields[altAt] ?? '').trim()
    if (!rawId && !alt) continue // a trailing blank line is not an error

    const id = /^\d+$/.test(rawId) ? Number(rawId) : rawId
    if (!rawId) {
      rejected.push({ line: record.line, reason: 'no media id' })
      continue
    }
    if (!alt) {
      rejected.push({
        line: record.line,
        reason: `media ${rawId} has no alt text`,
      })
      continue
    }
    rows.push({ id, alt })
  }

  return { rows, rejected }
}

/** One CSV record, plus the line it started on for error reporting. */
function splitCsv(text: string): { fields: string[]; line: number }[] {
  const records: { fields: string[]; line: number }[] = []
  let fields: string[] = []
  let field = ''
  let quoted = false
  let line = 1
  let startLine = 1

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        if (char === '\n') line++
        field += char
      }
      continue
    }

    if (char === '"') {
      quoted = true
    } else if (char === ',') {
      fields.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      fields.push(field)
      records.push({ fields, line: startLine })
      fields = []
      field = ''
      line++
      startLine = line
    } else {
      field += char
    }
  }

  if (field !== '' || fields.length > 0) {
    fields.push(field)
    records.push({ fields, line: startLine })
  }

  return records
}

/** True when the site would actually render this text as an alternative. */
export function isUsableAlt(alt: string, filename?: string | null): boolean {
  return toAltText(alt, filename) !== ''
}

/**
 * Decide what to write, per record.
 *
 * A record is only ever in one bucket, and nothing is written for a bucket
 * other than `updates`.
 */
export function planAltRepair(
  docs: readonly MediaDoc[],
  rows: readonly AltRow[],
): AltPlan {
  const plan: AltPlan = {
    updates: [],
    unchanged: [],
    refused: [],
    unknown: [],
    unaddressed: [],
  }

  const byId = new Map<string, MediaDoc>()
  for (const doc of docs) byId.set(String(doc.id), doc)

  const proposed = new Set<string>()

  for (const row of rows) {
    const key = String(row.id)
    proposed.add(key)

    const doc = byId.get(key)
    if (!doc) {
      plan.unknown.push(row.id)
      continue
    }

    const filename = typeof doc.filename === 'string' ? doc.filename : null
    const before = typeof doc.alt === 'string' ? doc.alt : ''

    // Usability is decided before the comparison, and the order is the point.
    // A record the migration left holding its file name, proposed that same
    // file name, is not "already correct" — it is the fault this exists to
    // repair, and reporting it as unchanged would print a clean line for every
    // page still rendering alt="". Checked this way round, `unchanged` can
    // only ever mean "already carrying a description the site renders".
    if (!isUsableAlt(row.alt, filename)) {
      plan.refused.push({
        id: row.id,
        alt: row.alt,
        // The same test the frontend applies, so a refusal here is exactly a
        // page that would still render alt="".
        reason:
          'the site would discard this: it is blank, or a bare file name, which ' +
          'toAltText treats as no description at all',
      })
      continue
    }

    if (row.alt === before) {
      plan.unchanged.push({
        id: row.id,
        filename: filename ?? '',
        before,
        after: row.alt,
      })
      continue
    }

    plan.updates.push({
      id: row.id,
      filename: filename ?? '',
      before,
      after: row.alt,
    })
  }

  for (const doc of docs) {
    if (proposed.has(String(doc.id))) continue
    plan.unaddressed.push({
      id: doc.id,
      filename: typeof doc.filename === 'string' ? doc.filename : '',
    })
  }

  return plan
}
