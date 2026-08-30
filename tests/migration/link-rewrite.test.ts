import { describe, expect, it } from 'vitest'

import {
  findGhostUrlPlaceholders,
  repairEscapedQuotes,
  stripGhostUrlPlaceholders,
} from '../../lib/migration/link-rewrite'

describe('stripGhostUrlPlaceholders', () => {
  it('turns a placeholder link into a root-relative one', () => {
    const result = stripGhostUrlPlaceholders(
      '<p>see <a href="__GHOST_URL__/artist-time-management/">this</a></p>',
    )
    expect(result.html).toBe(
      '<p>see <a href="/artist-time-management/">this</a></p>',
    )
    expect(result.replaced).toBe(1)
  })

  it('replaces every occurrence, not just the first', () => {
    const result = stripGhostUrlPlaceholders(
      '<a href="__GHOST_URL__/a/">a</a><a href="__GHOST_URL__/b/">b</a>',
    )
    expect(result.html).toBe('<a href="/a/">a</a><a href="/b/">b</a>')
    expect(result.replaced).toBe(2)
  })

  it('handles tag and prefixed paths without special-casing them', () => {
    expect(
      stripGhostUrlPlaceholders(
        '<a href="__GHOST_URL__/tag/studio-insider/">t</a>',
      ).html,
    ).toBe('<a href="/tag/studio-insider/">t</a>')
    expect(
      stripGhostUrlPlaceholders('<a href="__GHOST_URL__/article/sfumato">s</a>')
        .html,
    ).toBe('<a href="/article/sfumato">s</a>')
  })

  it('is idempotent, which is what makes a rerun safe', () => {
    const once = stripGhostUrlPlaceholders('<a href="__GHOST_URL__/x/">x</a>')
    const twice = stripGhostUrlPlaceholders(once.html)
    expect(twice.html).toBe(once.html)
    expect(twice.replaced).toBe(0)
  })

  it('leaves a body with no placeholder untouched', () => {
    const html = '<p>Ordinary prose with <a href="/elsewhere/">a link</a>.</p>'
    expect(stripGhostUrlPlaceholders(html)).toEqual({ html, replaced: 0 })
  })

  it('does not disturb absolute links to the live domain', () => {
    const html = '<a href="https://www.beyondeveryart.com/some-post/">x</a>'
    expect(stripGhostUrlPlaceholders(html).html).toBe(html)
  })

  it('treats null and empty bodies as nothing to do', () => {
    expect(stripGhostUrlPlaceholders(null)).toEqual({ html: '', replaced: 0 })
    expect(stripGhostUrlPlaceholders(undefined)).toEqual({
      html: '',
      replaced: 0,
    })
    expect(stripGhostUrlPlaceholders('')).toEqual({ html: '', replaced: 0 })
  })
})

describe('findGhostUrlPlaceholders', () => {
  it('reports each distinct placeholder URL once', () => {
    const found = findGhostUrlPlaceholders(
      '<a href="__GHOST_URL__/a/">1</a><a href="__GHOST_URL__/a/">2</a>' +
        '<a href="__GHOST_URL__/tag/b/">3</a>',
    )
    expect(found).toEqual(['__GHOST_URL__/a/', '__GHOST_URL__/tag/b/'])
  })

  it('stops at the closing quote rather than swallowing the markup', () => {
    expect(
      findGhostUrlPlaceholders('<a href="__GHOST_URL__/x/">text</a>'),
    ).toEqual(['__GHOST_URL__/x/'])
  })

  it('finds a path with no trailing slash', () => {
    expect(
      findGhostUrlPlaceholders(
        '<a href="__GHOST_URL__/archival-practices">x</a>',
      ),
    ).toEqual(['__GHOST_URL__/archival-practices'])
  })

  it('returns nothing for a clean body', () => {
    expect(findGhostUrlPlaceholders('<p>clean</p>')).toEqual([])
    expect(findGhostUrlPlaceholders(null)).toEqual([])
  })
})

describe('repairEscapedQuotes', () => {
  it('unwraps an href whose value was wrapped in escaped entities', () => {
    const result = repairEscapedQuotes(
      '<a href="\\&quot;https://www.nature.com/collections/fbaaejdihf\\&quot;">npj</a>',
    )
    expect(result.html).toBe(
      '<a href="https://www.nature.com/collections/fbaaejdihf">npj</a>',
    )
    expect(result.replaced).toBe(2)
  })

  it('removes the entity rather than substituting a quote', () => {
    // Substituting would give href=""url"" — broken a second way.
    expect(
      repairEscapedQuotes('<a href="\\&quot;/x/\\&quot;">x</a>').html,
    ).not.toContain('""')
  })

  it('turns a backslash-quote in prose into the quote it meant', () => {
    expect(repairEscapedQuotes('their \\"drying\\" ability').html).toBe(
      'their "drying" ability',
    )
  })

  it('repairs both artefacts in one body without either clipping the other', () => {
    const result = repairEscapedQuotes(
      'their \\"drying\\" ability, see <a href="\\&quot;https://e.com/\\&quot;">e</a>',
    )
    expect(result.html).toBe(
      'their "drying" ability, see <a href="https://e.com/">e</a>',
    )
    expect(result.replaced).toBe(4)
  })

  it('is idempotent', () => {
    const once = repairEscapedQuotes('<a href="\\&quot;/x/\\&quot;">x</a>')
    const twice = repairEscapedQuotes(once.html)
    expect(twice.html).toBe(once.html)
    expect(twice.replaced).toBe(0)
  })

  it('leaves an ordinary body and a legitimate entity alone', () => {
    const html =
      '<p>A &quot;quoted&quot; word and <a href="/x/">a link</a>.</p>'
    expect(repairEscapedQuotes(html)).toEqual({ html, replaced: 0 })
  })

  it('treats null and empty bodies as nothing to do', () => {
    expect(repairEscapedQuotes(null)).toEqual({ html: '', replaced: 0 })
    expect(repairEscapedQuotes('')).toEqual({ html: '', replaced: 0 })
  })
})
