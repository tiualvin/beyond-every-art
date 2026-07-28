// Structured logging for MCP activity.
//
// Payload's version history records what changed and when, not who — and with
// autosave running at 800ms on Posts and Pages, an agent's edits are
// indistinguishable from a person's. Once the endpoint is reachable from the
// internet that gap matters: without this there is no trail from a change back
// to the key that made it.
//
// One JSON line per event, alongside the existing `request_error`, `not_found`,
// `webhook_rejected`, and `csp_violation` lines in `docker compose logs app`.

import type { CollectionAfterChangeHook } from 'payload'

/** Cap on any logged free-text field, so one request cannot flood the log. */
const MAX_FIELD = 120

export interface McpSessionLogEntry {
  level: 'info'
  event: 'mcp_session'
  time: string
  /** Label of the API key, as set in the admin panel. */
  key: string | null
  /** Payload user the key acts as. */
  userId: string | null
  role: string | null
}

export interface McpWriteLogEntry {
  level: 'info'
  event: 'mcp_write'
  time: string
  collection: string
  operation: string
  documentId: string | null
  /** Draft or published, after the write. */
  status: string | null
  userId: string | null
  role: string | null
}

function field(value: unknown): string | null {
  if (typeof value === 'number') return String(value)
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, MAX_FIELD) : null
}

export function mcpSessionLogEntry(input: {
  key?: unknown
  role?: unknown
  time?: string
  userId?: unknown
}): McpSessionLogEntry {
  return {
    event: 'mcp_session',
    key: field(input.key),
    level: 'info',
    role: field(input.role),
    time: input.time ?? new Date().toISOString(),
    userId: field(input.userId),
  }
}

export function mcpWriteLogEntry(input: {
  collection: string
  documentId?: unknown
  operation: string
  role?: unknown
  status?: unknown
  time?: string
  userId?: unknown
}): McpWriteLogEntry {
  return {
    collection: input.collection,
    documentId: field(input.documentId),
    event: 'mcp_write',
    level: 'info',
    operation: input.operation,
    role: field(input.role),
    status: field(input.status),
    time: input.time ?? new Date().toISOString(),
    userId: field(input.userId),
  }
}

export function logMcpEvent(
  entry: McpSessionLogEntry | McpWriteLogEntry,
): void {
  process.stdout.write(`${JSON.stringify(entry)}\n`)
}

/**
 * Logs writes that arrived over MCP, and only those. Admin-panel, REST,
 * GraphQL, seed, and importer writes pass through untouched — they are already
 * attributable, or are not a security question.
 */
export const recordMcpWrite: CollectionAfterChangeHook = ({
  collection,
  doc,
  operation,
  req,
}) => {
  if (req.payloadAPI !== 'MCP') return doc

  logMcpEvent(
    mcpWriteLogEntry({
      collection: collection.slug,
      documentId: (doc as { id?: unknown })?.id,
      operation,
      role: (req.user as { role?: string } | null | undefined)?.role,
      status: (doc as { _status?: unknown })?._status,
      userId: req.user?.id,
    }),
  )

  return doc
}
