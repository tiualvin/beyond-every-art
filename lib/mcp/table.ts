// Setting a comparison table without touching the rest of the body.
//
// Placed by the rules `placement.ts` shares with key facts and FAQs, with one
// difference that comes from what tables are: an article holds one set of key
// facts and one FAQ, but any number of tables. So "replace the one it has"
// cannot be the only rule, or a second table could never be added. A table is
// addressed three ways, most specific first:
//
// - `key`: the table whose marker carries it, wherever it is.
// - `afterHeading`: the table in that heading's section, if the section has
//   one — replaced where it stands. If it has none, a new table goes directly
//   under the heading. A section with two is refused; say which by key.
// - neither: the article's only table. None, or several, is refused.
//
// The call's `columns` and `rows` map onto the block the way a Markdown table
// reads: the first column names the rows. `columns[0]` is the block's
// `rowHeader`, the rest are its column labels; `rows[n][0]` is a row's label
// and the rest are its cells. Cells and row labels are inline Markdown — see
// `lib/content/inline-markdown.ts`.
//
// Or the table can be read from the Markdown table already under the heading,
// which the body stores as one paragraph of pipe-bounded lines. That paragraph
// is converted back to Markdown by the caller, with the body's own converter —
// so a species written in italics inside the pipe table is still in italics in
// the cell — and split here.

import {
  COMPARISON_TABLE_BLOCK,
  type ComparisonTableData,
} from '../../blocks/schema'
import {
  blockMarker,
  indexBlocks,
  type BlockNode,
  type LexicalNode,
} from './blocks'
import type { EditorState } from './markdown'
import {
  blockNode,
  bodyChildren,
  findHeading,
  isPipeTable,
  keptKey,
  objectId,
  quoteList,
  sectionEnd,
  withChildren,
} from './placement'

/** Value columns a table may have, beside the column naming its rows. */
export const TABLE_MAX_COLUMNS = 5
export const TABLE_MAX_ROWS = 30

export type TableInput = {
  caption: string
  columns?: string[]
  rows?: string[][]
  key?: string
  afterHeading?: string
  replacePipeTable?: boolean
}

export type TableResult = {
  state: EditorState
  placement: 'inserted' | 'replaced'
  key: string
  marker: string
  /** The body heading above the table, or null when it precedes them all. */
  afterHeading: string | null
  removedTable: boolean
  /** Whether the columns and rows were read from the Markdown table. */
  parsedFromPipeTable: boolean
  columns: number
  rows: number
}

/** A pipe-table paragraph, back as the Markdown it was written in. */
export type PipeMarkdown = (node: LexicalNode) => string

/** One line of a pipe table, split into cells; `\|` is a literal pipe. */
function splitRow(line: string): string[] {
  const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return inner
    .split(/(?<!\\)\|/)
    .map((cell) => cell.replace(/\\\|/g, '|').trim())
}

/**
 * The header and rows of a Markdown pipe table, or null when the text is not
 * one. The `|---|---|` separator line is dropped wherever it sits, so a table
 * missing it still reads.
 */
export function parsePipeTable(
  markdown: string,
): { columns: string[]; rows: string[][] } | null {
  const lines = markdown
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (!lines.length || !lines.every((line) => /^\|.*\|$/.test(line))) {
    return null
  }

  const [header, ...body] = lines
    .map(splitRow)
    .filter((cells) => !cells.every((cell) => /^:?-{1,}:?$/.test(cell)))
  if (!header) return null

  return { columns: header, rows: body }
}

const flat = (value: string | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

/**
 * The call's columns and rows as the block stores them, or a refusal naming
 * the first problem. Checked here as well as by the tool's schema: a draft
 * save skips Payload's own field validation, and a table missing a caption or
 * a label would save and then be refused at publish.
 */
function toFields(
  caption: string,
  columns: string[],
  rows: string[][],
): Omit<ComparisonTableData, 'caption'> & { caption: string } {
  const title = flat(caption)
  if (!title) {
    throw new Error(
      'A comparison table needs a caption: what it shows, as a sentence. ' +
        'It is read out before the table and is often the only description ' +
        'a search result gets.',
    )
  }

  const heads = columns.map(flat)
  if (heads.length < 2) {
    throw new Error(
      'Give at least two columns: the first names the rows, and each of the ' +
        'others is a column of values.',
    )
  }
  if (heads.length > TABLE_MAX_COLUMNS + 1) {
    throw new Error(
      `A comparison table holds at most ${TABLE_MAX_COLUMNS} columns of ` +
        `values beside the one naming the rows; this call gave ` +
        `${heads.length - 1}. A wider table is a spreadsheet, and no phone ` +
        'reads one.',
    )
  }

  const missing = heads.slice(1).findIndex((head) => !head)
  if (missing !== -1) {
    throw new Error(
      `Column ${missing + 2} has no heading. Every column of values needs ` +
        'one; only the first, which names the rows, may be blank.' +
        (heads.length === 2
          ? ' A two-column table without headings is a list of facts: ' +
            'use setKeyFactsBlock for that.'
          : ''),
    )
  }

  if (!rows.length) throw new Error('Give at least one row.')
  if (rows.length > TABLE_MAX_ROWS) {
    throw new Error(
      `A comparison table holds at most ${TABLE_MAX_ROWS} rows; this call ` +
        `gave ${rows.length}.`,
    )
  }

  return {
    caption: title,
    ...(heads[0] ? { rowHeader: heads[0] } : {}),
    columns: heads.slice(1).map((label) => ({ id: objectId(), label })),
    rows: rows.map((row, index) => {
      if (row.length > heads.length) {
        throw new Error(
          `Row ${index + 1} has ${row.length} cells, more than the ` +
            `${heads.length} columns. Extra cells would never be shown.`,
        )
      }
      const [label, ...cells] = row.map(flat)
      if (!label) {
        throw new Error(
          `Row ${index + 1} has no label: its first cell names the row.`,
        )
      }
      return {
        id: objectId(),
        label,
        cells: cells.map((value) => ({ id: objectId(), value })),
      }
    }),
  }
}

export function setTable(
  state: EditorState | null | undefined,
  input: TableInput,
  pipeMarkdown: PipeMarkdown,
): TableResult {
  const children = bodyChildren(state)
  const tables = indexBlocks(state).filter(
    ({ node }) => node.fields.blockType === COMPARISON_TABLE_BLOCK,
  )
  if ((input.columns === undefined) !== (input.rows === undefined)) {
    throw new Error('Give both columns and rows, or neither.')
  }
  const fromPipe = input.columns === undefined

  const done = (
    placement: TableResult['placement'],
    key: string,
    fields: ReturnType<typeof toFields>,
    extra: { afterHeading: string | null; removedTable: boolean },
  ): TableResult => ({
    state: withChildren(state, children),
    placement,
    key,
    marker: blockMarker(COMPARISON_TABLE_BLOCK, key),
    parsedFromPipeTable: fromPipe,
    columns: fields.columns?.length ?? 0,
    rows: fields.rows?.length ?? 0,
    ...extra,
  })

  const replace = (target: (typeof tables)[number]) => {
    if (fromPipe) {
      throw new Error(
        'This table is replacing one that is already a comparison table, so ' +
          'there is no Markdown table to read: give columns and rows.',
      )
    }
    const fields = toFields(input.caption, input.columns!, input.rows!)
    const key = keptKey(target.node)
    children[target.index] = {
      ...target.node,
      fields: {
        id: key,
        blockName: target.node.fields.blockName ?? '',
        blockType: COMPARISON_TABLE_BLOCK,
        ...fields,
      } as BlockNode['fields'],
    } as LexicalNode
    return done('replaced', key, fields, {
      afterHeading: target.afterHeading,
      removedTable: false,
    })
  }

  // 1. By key.
  if (input.key) {
    const target = tables.find((table) => table.key === input.key)
    if (!target) {
      throw new Error(
        `No comparison table in this article has the key "${input.key}". ` +
          (tables.length
            ? `Its tables are ${quoteList(tables.map((t) => `${t.key}, under ${t.afterHeading ?? '(top)'}`))}.`
            : 'It has none.'),
      )
    }
    return replace(target)
  }

  // 3. Neither: the article's only table.
  if (!input.afterHeading?.trim()) {
    if (tables.length === 1) return replace(tables[0])
    if (tables.length > 1) {
      throw new Error(
        `This article has ${tables.length} comparison tables, so say which: ` +
          'pass key (from its marker line in readArticleMarkdown) or ' +
          `afterHeading. Its tables are ${quoteList(tables.map((t) => `${t.key}, under ${t.afterHeading ?? '(top)'}`))}.`,
      )
    }
    // None: the standard refusal, listing the headings there are.
    findHeading(children, undefined, {
      none: 'comparison table',
      placed: 'the table goes',
    })
  }

  // 2. By heading: the table in that section, or a new one under it.
  const match = findHeading(children, input.afterHeading, {
    none: 'comparison table',
    placed: 'the table goes',
  })
  const end = sectionEnd(children, match.index, match.level)
  const inSection = tables.filter(
    (table) => table.index > match.index && table.index < end,
  )
  if (inSection.length > 1) {
    throw new Error(
      `The section under "${match.text}" holds ${inSection.length} ` +
        'comparison tables, so it does not say which to replace. Pass key ' +
        `instead: ${quoteList(inSection.map((t) => t.key))}.`,
    )
  }
  if (inSection.length === 1) return replace(inSection[0])

  const at = match.index + 1
  const pipe = isPipeTable(children[at]) ? children[at] : undefined

  if ((input.replacePipeTable || fromPipe) && !pipe) {
    throw new Error(
      `There is no Markdown table directly under "${match.text}"` +
        (fromPipe
          ? ' to read the table from, so give columns and rows.'
          : ' to replace, so nothing was changed. Call again without ' +
            'replacePipeTable to insert the table above what is there.'),
    )
  }

  let columns = input.columns
  let rows = input.rows
  if (fromPipe) {
    const parsed = parsePipeTable(pipeMarkdown(pipe!))
    if (!parsed) {
      throw new Error(
        `The paragraph under "${match.text}" does not read as a Markdown ` +
          'table, so give columns and rows.',
      )
    }
    ;({ columns, rows } = parsed)
  }

  const fields = toFields(input.caption, columns!, rows!)
  const key = objectId()
  const node = blockNode({
    id: key,
    blockName: '',
    blockType: COMPARISON_TABLE_BLOCK,
    ...fields,
  } as BlockNode['fields'])

  // Reading the table from the Markdown one means replacing it.
  const removedTable = Boolean(input.replacePipeTable || fromPipe)
  children.splice(at, removedTable ? 1 : 0, node)

  return done('inserted', key, fields, {
    afterHeading: match.text,
    removedTable,
  })
}
