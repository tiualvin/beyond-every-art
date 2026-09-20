import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { READ_NEXT_COUNT } from '../../lib/content/related'

const page = readFileSync(
  join(process.cwd(), 'app/(frontend)/[slug]/page.tsx'),
  'utf8',
)
const rail = readFileSync(
  join(process.cwd(), 'app/(frontend)/components/article-rail.tsx'),
  'utf8',
)

describe('related posts on a post page', () => {
  it('shows three, which is what "Read next" holds', () => {
    expect(READ_NEXT_COUNT).toBe(3)
  })

  // The page asked for six while the rail took a second helping of the same
  // query for its own list. That module is gone, and a limit left at six would
  // be three rows read on every post render that nothing renders — the kind of
  // cost that survives a deletion because nothing fails when it does.
  it('asks the database for exactly what it renders', () => {
    expect(page).toContain('READ_NEXT_COUNT,')
    expect(page).not.toContain('RELATED_QUERY_LIMIT')
    expect(page).not.toContain('splitRelated')
  })

  // The rail's copy of this list is gone. Everything it showed still closes
  // the article in "Read next", on every device rather than desktop only, so
  // a reader lost nothing — but a rail that quietly took posts again would put
  // the sticky group back over the height it is budgeted for.
  it('does not feed the rail a second copy of the list', () => {
    // The markup, not the prose: the component's doc comment explains why the
    // module went, so matching on its name would fail on the explanation.
    expect(rail).not.toContain('rail__related')
    expect(rail).not.toContain('rail__list')
    expect(rail).not.toContain('PostCard')
    expect(rail).not.toMatch(/related[?]?:/)
  })
})
