import { describe, expect, it } from 'vitest'

import { mcpSessionLogEntry, mcpWriteLogEntry } from '../../lib/mcp/audit'

describe('mcpSessionLogEntry', () => {
  it('records which key acted, and as whom', () => {
    expect(
      mcpSessionLogEntry({
        key: 'phone-drafting',
        role: 'editor',
        time: '2026-07-28T00:00:00.000Z',
        userId: 7,
      }),
    ).toEqual({
      event: 'mcp_session',
      key: 'phone-drafting',
      level: 'info',
      role: 'editor',
      time: '2026-07-28T00:00:00.000Z',
      userId: '7',
    })
  })

  it('nulls missing fields rather than emitting undefined', () => {
    const entry = mcpSessionLogEntry({ time: '2026-07-28T00:00:00.000Z' })

    expect(entry.key).toBeNull()
    expect(entry.role).toBeNull()
    expect(entry.userId).toBeNull()
  })

  it('caps a long label so one request cannot flood the log', () => {
    const entry = mcpSessionLogEntry({ key: 'x'.repeat(500) })

    expect(entry.key).toHaveLength(120)
  })
})

describe('mcpWriteLogEntry', () => {
  it('records the document, the operation, and the resulting status', () => {
    expect(
      mcpWriteLogEntry({
        collection: 'posts',
        documentId: 42,
        operation: 'update',
        role: 'admin',
        status: 'published',
        time: '2026-07-28T00:00:00.000Z',
        userId: 1,
      }),
    ).toEqual({
      collection: 'posts',
      documentId: '42',
      event: 'mcp_write',
      level: 'info',
      operation: 'update',
      role: 'admin',
      status: 'published',
      time: '2026-07-28T00:00:00.000Z',
      userId: '1',
    })
  })
})
