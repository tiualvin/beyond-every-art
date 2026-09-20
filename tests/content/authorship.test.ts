import type { CollectionBeforeChangeHook } from 'payload'
import { describe, expect, it } from 'vitest'

import { Pages } from '../../collections/Pages'
import { Posts } from '../../collections/Posts'
import { OPEN_REVIEW_STATES, REVIEW_STATES } from '../../fields/review'
import { stampLastEditedBy } from '../../lib/content/authorship'
import { findField } from '../support/fields'

type HookArgs = Parameters<CollectionBeforeChangeHook>[0]

function run(payloadAPI: string): Record<string, unknown> {
  return stampLastEditedBy({
    data: { title: 'Ultramarine' },
    req: { payloadAPI },
  } as unknown as HookArgs) as Record<string, unknown>
}

describe('stampLastEditedBy', () => {
  /**
   * `recordMcpWrite` keys on exactly this, so the two agree by construction
   * rather than by two separate guesses at the same question. If Payload ever
   * renames the marker, both move together and this test is what says so.
   */
  it('marks a write that came through the MCP server', () => {
    expect(run('MCP').lastEditedBy).toBe('agent')
  })

  it('marks everything else as a person', () => {
    expect(run('local').lastEditedBy).toBe('person')
    expect(run('REST').lastEditedBy).toBe('person')
  })

  /**
   * The flag has to turn over the moment a person touches an agent's draft —
   * that is the event the dashboard row is really asking about.
   */
  it('is wired into both collections an agent can write', () => {
    expect(Posts.hooks?.beforeChange).toContain(stampLastEditedBy)
    expect(Pages.hooks?.beforeChange).toContain(stampLastEditedBy)
  })

  it('keeps the field off the public API', () => {
    for (const collection of [Posts, Pages]) {
      const field = findField(collection.fields, 'lastEditedBy')
      expect(field).toBeDefined()
      expect(
        (field as { access?: { read?: unknown } }).access?.read,
      ).toBeDefined()
      expect(
        (field as { admin?: { readOnly?: boolean } }).admin?.readOnly,
      ).toBe(true)
    }
  })
})

describe('review state', () => {
  /**
   * It must not become a publishing gate. A CMS that argues with an editor
   * working alone is one they learn to route around, and the migrated archive
   * has no review history to invent.
   */
  it('has no default, so the workflow is opt-in per piece', () => {
    const field = findField(Posts.fields, 'reviewState') as {
      defaultValue?: unknown
      required?: boolean
    }
    expect(field).toBeDefined()
    expect(field.defaultValue).toBeUndefined()
    expect(field.required).toBeFalsy()
  })

  it('is separate from the draft/published status', () => {
    const status = findField(Posts.fields, '_status')
    // Payload owns `_status`; this must not have shadowed or replaced it.
    expect(status).toBeUndefined()
    expect(Posts.versions).toBeTruthy()
  })

  it('treats only the handed-over states as waiting on somebody', () => {
    expect(OPEN_REVIEW_STATES).toEqual(['ready', 'changes'])
    for (const state of OPEN_REVIEW_STATES) {
      expect(REVIEW_STATES).toContain(state)
    }
    expect(OPEN_REVIEW_STATES).not.toContain('writing')
  })
})
