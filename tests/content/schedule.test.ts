import type { CollectionBeforeChangeHook } from 'payload'
import { describe, expect, it } from 'vitest'

import { Pages } from '../../collections/Pages'
import { Posts } from '../../collections/Posts'
import { stampPublishedAt } from '../../lib/content/publish-date'
import { isScheduled, live, notScheduled } from '../../lib/content/schedule'

type HookArgs = Parameters<CollectionBeforeChangeHook>[0]

/** Runs the hook the way Payload does, with a patch and the stored document. */
function run(
  data: Record<string, unknown>,
  originalDoc?: Record<string, unknown>,
): Record<string, unknown> {
  return stampPublishedAt({
    data,
    originalDoc,
    operation: originalDoc ? 'update' : 'create',
  } as unknown as HookArgs) as Record<string, unknown>
}

describe('stampPublishedAt', () => {
  it('dates a post that is published without one', () => {
    const result = run({ _status: 'published', title: 'Ultramarine' })
    expect(typeof result.publishedAt).toBe('string')
    expect(Number.isFinite(Date.parse(result.publishedAt as string))).toBe(true)
  })

  it('leaves a draft alone, so autosave is not a publication', () => {
    const result = run({ _status: 'draft', title: 'Half-written' })
    expect(result.publishedAt).toBeUndefined()
  })

  /**
   * Backdating is how a migrated piece keeps its real date and how an editor
   * corrects one. Forward-dating is how a piece is scheduled. Overwriting
   * either would make both impossible.
   */
  it('never overwrites a date somebody chose', () => {
    const chosen = '2019-04-01T09:00:00.000Z'
    expect(run({ _status: 'published', publishedAt: chosen }).publishedAt).toBe(
      chosen,
    )
    const future = '2099-01-01T00:00:00.000Z'
    expect(run({ _status: 'published', publishedAt: future }).publishedAt).toBe(
      future,
    )
  })

  /**
   * Payload hands this hook a patch. An autosave that touches only the body
   * carries no `_status`, and reading that absence as "not published" would
   * leave exactly the documents this exists for unstamped.
   */
  it('reads status and date through to the stored document', () => {
    const patch = run({ content: {} }, { _status: 'published' })
    expect(typeof patch.publishedAt).toBe('string')

    // And leaves the patch untouched where a stored date already exists.
    // Payload merges the patch onto the document, so *omitting* the field is
    // what preserves it — writing it back would be the same value taking a
    // longer route, and would defeat the check on the next patch that changed
    // it.
    const kept = run(
      { content: {} },
      { _status: 'published', publishedAt: '2020-06-06T00:00:00.000Z' },
    )
    expect(kept.publishedAt).toBeUndefined()
  })

  it('is wired into both collections that carry a date', () => {
    expect(Posts.hooks?.beforeChange).toContain(stampPublishedAt)
    expect(Pages.hooks?.beforeChange).toContain(stampPublishedAt)
  })
})

describe('live()', () => {
  const now = new Date('2026-09-20T12:00:00.000Z')

  it('requires published status', () => {
    expect(live(now).and?.[0]).toEqual({ _status: { equals: 'published' } })
  })

  /**
   * The load-bearing half. A published document with no date must stay public:
   * refusing to serve one would turn a cosmetic ordering fault into a live
   * article disappearing from the site, which is far more expensive.
   */
  it('treats a missing date as public, never as withheld', () => {
    const clause = notScheduled(now)
    expect(clause.or).toContainEqual({ publishedAt: { exists: false } })
  })

  it('withholds a document whose date has not arrived', () => {
    const clause = notScheduled(now)
    expect(clause.or).toContainEqual({
      publishedAt: { less_than_equal: now.toISOString() },
    })
  })

  /**
   * A module-level constant would freeze "now" at boot, so a long-running
   * container would go on withholding a post for as long as it had been up.
   */
  it('recomputes the moment on every call', () => {
    const a = notScheduled(new Date('2026-01-01T00:00:00.000Z'))
    const b = notScheduled(new Date('2026-02-01T00:00:00.000Z'))
    expect(a).not.toEqual(b)
  })
})

describe('isScheduled', () => {
  const now = new Date('2026-09-20T12:00:00.000Z')

  it('is true only for a published document dated ahead', () => {
    expect(isScheduled('published', '2026-09-21T00:00:00.000Z', now)).toBe(true)
    expect(isScheduled('published', '2026-09-19T00:00:00.000Z', now)).toBe(
      false,
    )
    expect(isScheduled('draft', '2026-09-21T00:00:00.000Z', now)).toBe(false)
    expect(isScheduled('published', null, now)).toBe(false)
    expect(isScheduled('published', 'not a date', now)).toBe(false)
  })
})
