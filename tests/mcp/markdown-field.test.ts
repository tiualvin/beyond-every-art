import type { Payload } from 'payload'
import { describe, expect, it } from 'vitest'

import { Pages } from '../../collections/Pages'
import { Posts } from '../../collections/Posts'
import { contentEditorConfig } from '../../lib/mcp/markdown'
import { findField } from '../support/fields'

/**
 * The regression: arranging Posts and Pages into tabs broke agent drafting.
 *
 * `contentEditorConfig` looked only at the top level of `fields`, which was
 * true until the edit view was arranged into tabs. An unnamed tab changes no
 * schema and no stored document, so every other reader of `content` carried on
 * working — but this one reads the *config* rather than the data, and the
 * config is exactly what a tab reshapes. The symptom was `draftArticle`
 * answering "No rich-text `content` field found on `posts`", which is a
 * sentence about the schema that was not true of the schema.
 *
 * Nothing in the unit suite caught it, because the failure needs a real
 * `payload.collections` map. That is what the stub below stands in for.
 */

function stub(): Payload {
  return {
    collections: {
      posts: { config: Posts },
      pages: { config: Pages },
    },
  } as unknown as Payload
}

describe('contentEditorConfig', () => {
  it.each(['posts', 'pages'] as const)(
    'finds the %s body wherever the edit view puts it',
    (collection) => {
      expect(() => contentEditorConfig(stub(), collection)).not.toThrow()
    },
  )

  /**
   * Stated as an assumption rather than left implied: these tools convert
   * Markdown against the editor attached to the field that will store the
   * result, so the field has to be the real one and not merely something
   * named `content`.
   */
  it.each(['posts', 'pages'] as const)(
    'resolves the %s body to a rich-text field with its own editor',
    (collection) => {
      const field = findField(
        (collection === 'posts' ? Posts : Pages).fields,
        'content',
      )
      expect(field).toBeDefined()
      expect((field as { type?: string }).type).toBe('richText')
      expect((field as { editor?: unknown }).editor).toBeDefined()
    },
  )

  it('still refuses a collection that genuinely has no body', () => {
    const empty = {
      collections: { posts: { config: { ...Posts, fields: [] } } },
    } as unknown as Payload
    expect(() => contentEditorConfig(empty, 'posts')).toThrow(/No rich-text/)
  })
})
