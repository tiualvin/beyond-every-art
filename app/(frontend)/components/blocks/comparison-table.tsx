import type { ComparisonTableData } from '@/blocks/schema'

/**
 * A small table of values compared across columns.
 *
 * The markup is the module. A `<caption>` names the table before a screen
 * reader reads any of it; `scope="col"` and `scope="row"` are what let one
 * announce "Ultramarine, lightfastness, excellent" instead of reciting a grid
 * of loose words; and a real `<table>` is what a search engine can lift into a
 * result. None of that survives an editor building a grid out of paragraphs,
 * which is the alternative this replaces.
 *
 * Rows are padded to the column count rather than rejected for having too few
 * cells. A half-filled row is what a draft looks like, and a table that
 * refuses to render is worse feedback than one with a gap in it.
 *
 * The scroll container is focusable and labelled, because a table wider than
 * the phone it is read on has to be scrollable by keyboard too — an
 * `overflow-x` box that cannot be reached by tab is content a keyboard user
 * simply cannot see.
 */
export function ComparisonTable({ data }: { data: ComparisonTableData }) {
  const columns = (data.columns ?? []).flatMap((column) => {
    const label = column?.label?.trim()
    return label ? [{ label, id: column?.id }] : []
  })

  const rows = (data.rows ?? []).flatMap((row) => {
    const label = row?.label?.trim()
    if (!label) return []
    const cells = columns.map(
      (_column, index) => row?.cells?.[index]?.value?.trim() || '',
    )
    return [{ label, cells, id: row?.id }]
  })

  const caption = data.caption?.trim()
  if (columns.length === 0 || rows.length === 0) return null

  const rowHeader = data.rowHeader?.trim() || ''

  return (
    <figure className="module module--table comparison">
      <div
        className="comparison__scroll"
        // A labelled region rather than a bare div: the label is what tells a
        // keyboard user what they have just tabbed into.
        role="region"
        aria-label={caption || 'Comparison table'}
        tabIndex={0}
      >
        <table className="comparison__table">
          {caption && (
            <caption className="comparison__caption">{caption}</caption>
          )}
          <thead>
            <tr>
              {/* The corner cell names the row-header column when it has a
                  name, and is an empty `<td>` when it does not — an empty
                  `<th>` claims to head something it does not describe. */}
              {rowHeader ? (
                <th scope="col">{rowHeader}</th>
              ) : (
                <td className="comparison__corner" />
              )}
              {columns.map((column, index) => (
                <th scope="col" key={column.id ?? index}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={row.id ?? rowIndex}>
                <th scope="row">{row.label}</th>
                {row.cells.map((cell, cellIndex) => (
                  <td key={cellIndex}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}
