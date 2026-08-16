import { describe, expect, it } from 'vitest'

import { buildUnknownBlockEntry } from '../../lib/observability/unknown-block'

const now = new Date('2026-03-01T12:00:00.000Z')

describe('buildUnknownBlockEntry', () => {
  it('records the node and block type', () => {
    expect(
      buildUnknownBlockEntry({
        nodeType: 'block',
        blockType: 'productRecommendation',
        now,
      }),
    ).toEqual({
      level: 'warn',
      event: 'unknown_body_node',
      time: '2026-03-01T12:00:00.000Z',
      nodeType: 'block',
      blockType: 'productRecommendation',
    })
  })

  it('records a bare node type with no block', () => {
    expect(
      buildUnknownBlockEntry({ nodeType: 'horizontalrule', now }),
    ).toMatchObject({ nodeType: 'horizontalrule', blockType: null })
  })

  it('ignores a node with no type to report', () => {
    expect(buildUnknownBlockEntry({ nodeType: null })).toBeNull()
    expect(buildUnknownBlockEntry({ nodeType: '   ' })).toBeNull()
  })

  it('bounds what a document can put in the log', () => {
    // The slug comes out of a document, so its length is editor-controlled;
    // an unbounded value here is a log-flooding vector.
    const entry = buildUnknownBlockEntry({
      nodeType: 'block',
      blockType: 'x'.repeat(500),
      now,
    })

    expect(entry?.blockType?.length).toBeLessThanOrEqual(201)
  })
})
