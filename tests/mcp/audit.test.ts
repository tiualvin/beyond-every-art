import type { CollectionConfig } from 'payload'
import { describe, expect, it } from 'vitest'

import { Authors } from '../../collections/Authors'
import { Media } from '../../collections/Media'
import { Pages } from '../../collections/Pages'
import { Posts } from '../../collections/Posts'
import { Tags } from '../../collections/Tags'
import {
  mcpAuthLogEntry,
  mcpEventLogEntry,
  mcpRefusedLogEntry,
  mcpWriteLogEntry,
  recordMcpWrite,
} from '../../lib/mcp/audit'
import { mcpPluginConfig } from '../../lib/mcp/plugin'

describe('mcpAuthLogEntry', () => {
  it('records which key acted, and as whom', () => {
    expect(
      mcpAuthLogEntry({
        key: 'phone-drafting',
        role: 'editor',
        time: '2026-07-28T00:00:00.000Z',
        userId: 7,
      }),
    ).toEqual({
      event: 'mcp_auth',
      key: 'phone-drafting',
      level: 'info',
      role: 'editor',
      time: '2026-07-28T00:00:00.000Z',
      userId: '7',
    })
  })

  it('nulls missing fields rather than emitting undefined', () => {
    const entry = mcpAuthLogEntry({ time: '2026-07-28T00:00:00.000Z' })

    expect(entry.key).toBeNull()
    expect(entry.role).toBeNull()
    expect(entry.userId).toBeNull()
  })

  it('caps a long label so one request cannot flood the log', () => {
    const entry = mcpAuthLogEntry({ key: 'x'.repeat(500) })

    expect(entry.key).toHaveLength(120)
  })
})

describe('mcpRefusedLogEntry', () => {
  // Both refusals happen before the MCP handler is entered, so nothing else in
  // the stack records them. Without these lines a run of guessed keys against a
  // publicly reachable endpoint leaves no evidence at all.
  it('records a rate-limited caller and when it may retry', () => {
    expect(
      mcpRefusedLogEntry({
        caller: 'key:1a2b3c4d',
        reason: 'rate_limited',
        retryAfter: 42,
        time: '2026-07-28T00:00:00.000Z',
      }),
    ).toEqual({
      caller: 'key:1a2b3c4d',
      event: 'mcp_refused',
      level: 'warn',
      reason: 'rate_limited',
      retryAfter: 42,
      time: '2026-07-28T00:00:00.000Z',
    })
  })

  it('records an unrecognised key with no retry window', () => {
    const entry = mcpRefusedLogEntry({
      caller: 'anonymous',
      reason: 'unauthorized',
    })

    expect(entry.reason).toBe('unauthorized')
    expect(entry.retryAfter).toBeNull()
  })
})

describe('mcpEventLogEntry', () => {
  const time = '2026-07-28T00:00:00.000Z'

  it('names the tool a call asked for', () => {
    expect(
      mcpEventLogEntry(
        {
          duration: 120,
          method: 'tools/call',
          // `mcp-handler` passes the request body as `result`.
          result: {
            id: 3,
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              arguments: { markdown: '# Draft' },
              name: 'draftArticle',
            },
          },
          status: 'success',
          type: 'REQUEST_COMPLETED',
        },
        time,
      ),
    ).toEqual({
      durationMs: 120,
      event: 'mcp_request',
      level: 'info',
      method: 'tools/call',
      status: 'success',
      time,
      tool: 'draftArticle',
    })
  })

  // The arguments of an `uploadMedia` call are an entire image. Logging the
  // event verbatim would put megabytes of base64 into stdout on every upload.
  it('never carries the call arguments into the log', () => {
    const entry = mcpEventLogEntry(
      {
        method: 'tools/call',
        result: {
          method: 'tools/call',
          params: {
            arguments: { base64: 'A'.repeat(5000), alt: 'a painting' },
            name: 'uploadMedia',
          },
        },
        status: 'success',
        type: 'REQUEST_COMPLETED',
      },
      time,
    )

    expect(JSON.stringify(entry)).not.toContain('AAAA')
    expect(JSON.stringify(entry)).not.toContain('a painting')
  })

  it('logs methods that are not tool calls, with no tool', () => {
    const entry = mcpEventLogEntry(
      { method: 'tools/list', status: 'success', type: 'REQUEST_COMPLETED' },
      time,
    )

    expect(entry).toMatchObject({ method: 'tools/list', tool: null })
  })

  it('records a transport error', () => {
    expect(
      mcpEventLogEntry(
        {
          context: 'Error executing request tools/call',
          error: new Error('socket hang up'),
          severity: 'error',
          source: 'request',
          type: 'ERROR',
        },
        time,
      ),
    ).toEqual({
      context: 'Error executing request tools/call',
      event: 'mcp_error',
      level: 'error',
      message: 'socket hang up',
      severity: 'error',
      source: 'request',
      time,
    })
  })

  // The transport is stateless and SSE is off, so these never arrive on this
  // endpoint. Ignoring them keeps the log to events that actually happen.
  it.each(['SESSION_STARTED', 'SESSION_ENDED', 'REQUEST_RECEIVED'])(
    'ignores %s',
    (type) => {
      expect(mcpEventLogEntry({ type }, time)).toBeNull()
    },
  )

  it('ignores anything that is not an event', () => {
    expect(mcpEventLogEntry(null)).toBeNull()
    expect(mcpEventLogEntry('REQUEST_COMPLETED')).toBeNull()
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

describe('recordMcpWrite coverage', () => {
  // The plugin's generated tools write to whatever the allowlist enables, and
  // the custom tools write where their handlers say. Both lists are here so a
  // collection cannot become writable over MCP without leaving a trail: Media
  // and Tags were, for as long as the upload tools and `updateTags` existed,
  // and the log said which key called but never which document changed.
  const COLLECTIONS: Record<string, CollectionConfig> = {
    authors: Authors,
    media: Media,
    pages: Pages,
    posts: Posts,
    tags: Tags,
  }

  /** Where the custom tools in `lib/mcp/tools.ts` create or update documents. */
  const CUSTOM_TOOL_WRITES = ['media', 'posts']

  const generatedWrites = Object.entries(mcpPluginConfig.collections ?? {})
    .filter(([, entry]) => {
      const enabled = (entry as { enabled?: unknown } | undefined)?.enabled
      if (enabled === true) return true
      if (typeof enabled !== 'object' || enabled === null) return false
      const operations = enabled as Record<string, unknown>
      return (
        operations.create === true ||
        operations.update === true ||
        operations.delete === true
      )
    })
    .map(([slug]) => slug)

  it.each([...new Set([...generatedWrites, ...CUSTOM_TOOL_WRITES])])(
    '%s records MCP writes',
    (slug) => {
      const collection = COLLECTIONS[slug]
      expect(collection, `no collection config for ${slug}`).toBeDefined()
      expect(collection!.hooks?.afterChange ?? []).toContain(recordMcpWrite)
    },
  )
})
