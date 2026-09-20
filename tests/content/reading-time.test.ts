import { describe, expect, it } from 'vitest'

import { readingTimeMinutes } from '../../lib/format'
import {
  htmlToPlainText,
  richTextToPlainText,
} from '../../lib/content/plain-text'

/**
 * `estimateWordCount` is module-private, so this exercises the two serializers
 * it delegates to and the arithmetic on the other side. What the test is really
 * pinning is the regression: a body written in the Lexical editor must produce
 * a word count from its own text, not from its excerpt.
 */

function words(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

function paragraph(text: string) {
  return {
    type: 'paragraph',
    children: [{ type: 'text', text, version: 1 }],
    version: 1,
  }
}

describe('reading time from a Lexical body', () => {
  it('counts the words actually in the body', () => {
    const body = {
      root: {
        type: 'root',
        version: 1,
        children: [paragraph('word '.repeat(2200).trim())],
      },
    }
    const counted = words(richTextToPlainText(body))
    expect(counted).toBe(2200)
    expect(readingTimeMinutes(counted)).toBe(10)
  })

  /**
   * The regression, stated as arithmetic. A long essay with a short excerpt
   * used to be measured as `excerpt words x 8` — here, eight words, one
   * minute — because every migrated document had `legacyHTML` and nothing
   * written natively had ever reached that branch.
   */
  it('does not take its answer from the excerpt', () => {
    const excerpt = 'A short line.'
    const fabricated = readingTimeMinutes(words(excerpt) * 8)

    const body = {
      root: {
        type: 'root',
        version: 1,
        children: [paragraph('word '.repeat(4000).trim())],
      },
    }
    const real = readingTimeMinutes(words(richTextToPlainText(body)))

    expect(fabricated).toBe(1)
    expect(real).toBe(18)
  })

  it('reads module text too, so a body of blocks is not empty', () => {
    const body = {
      root: {
        type: 'root',
        version: 1,
        children: [
          {
            type: 'block',
            version: 1,
            fields: {
              blockType: 'pullQuote',
              quote: 'Ultramarine was once worth more than gold.',
            },
          },
        ],
      },
    }
    expect(words(richTextToPlainText(body))).toBeGreaterThan(0)
  })
})

describe('reading time from preserved Ghost markup', () => {
  it('counts the prose and not the tags', () => {
    const html = `<p>${'word '.repeat(440).trim()}</p>`
    expect(words(htmlToPlainText(html))).toBe(440)
    expect(readingTimeMinutes(words(htmlToPlainText(html)))).toBe(2)
  })

  /**
   * The old tag strip read a `<script>` body as prose. Nothing on this site
   * publishes one, but `legacyHTML` is raw markup an editor may paste.
   */
  it('does not read script or style bodies as prose', () => {
    const html =
      '<p>one two</p><script>var a = 1; var b = 2; var c = 3;</script>'
    expect(words(htmlToPlainText(html))).toBe(2)
  })
})
