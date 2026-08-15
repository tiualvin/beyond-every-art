// Structured logging for MCP activity.
//
// Payload's version history records what changed and when, not who — and with
// autosave running at 800ms on Posts and Pages, an agent's edits are
// indistinguishable from a person's. Once the endpoint is reachable from the
// internet that gap matters: without this there is no trail from a change back
// to the key that made it.
//
// Four lines, alongside the existing `request_error`, `not_found`,
// `webhook_rejected`, and `csp_violation` lines in `docker compose logs app`:
//
//   `mcp_auth`     one per authenticated request — which key, acting as whom
//   `mcp_refused`  one per request that never reached a tool
//   `mcp_request`  one per JSON-RPC call — which tool, how long, how it ended
//   `mcp_write`    one per document written
//
// `mcp_auth` and `mcp_request` describe the same request from two sides and
// cannot be merged: the first is written where the key is known and the tool is
// not, the second where the tool is known and the request is not. The transport
// is stateless — see `mcpEventLogEntry` — so neither can be reduced to one line
// per session, because there is no session to reduce them to.

import type { CollectionAfterChangeHook } from 'payload'

/** Cap on any logged free-text field, so one request cannot flood the log. */
const MAX_FIELD = 120

export interface McpAuthLogEntry {
  level: 'info'
  event: 'mcp_auth'
  time: string
  /** Label of the API key, as set in the admin panel. */
  key: string | null
  /** Payload user the key acts as. */
  userId: string | null
  role: string | null
}

export interface McpRefusedLogEntry {
  level: 'warn'
  event: 'mcp_refused'
  time: string
  /** Why the request never reached a tool. */
  reason: 'rate_limited' | 'unauthorized'
  /** The limiter's bucket: `anonymous`, or the tail of the presented key. */
  caller: string
  /** Seconds until the caller may retry, where that is knowable. */
  retryAfter: number | null
}

export interface McpRequestLogEntry {
  level: 'info'
  event: 'mcp_request'
  time: string
  /** JSON-RPC method, e.g. `tools/call` or `tools/list`. */
  method: string | null
  /** The tool a `tools/call` asked for. Null for every other method. */
  tool: string | null
  durationMs: number | null
  status: string | null
}

export interface McpErrorLogEntry {
  level: 'error'
  event: 'mcp_error'
  time: string
  message: string | null
  context: string | null
  /** Which layer raised it: `request`, `session`, or `system`. */
  source: string | null
  severity: string | null
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

export type McpLogEntry =
  | McpAuthLogEntry
  | McpErrorLogEntry
  | McpRefusedLogEntry
  | McpRequestLogEntry
  | McpWriteLogEntry

function field(value: unknown): string | null {
  if (typeof value === 'number') return String(value)
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, MAX_FIELD) : null
}

export function mcpAuthLogEntry(input: {
  key?: unknown
  role?: unknown
  time?: string
  userId?: unknown
}): McpAuthLogEntry {
  return {
    event: 'mcp_auth',
    key: field(input.key),
    level: 'info',
    role: field(input.role),
    time: input.time ?? new Date().toISOString(),
    userId: field(input.userId),
  }
}

/**
 * A request turned away before any tool ran.
 *
 * Both refusals happen in `overrideAuth`, which the plugin calls before it
 * enters the MCP handler — so neither reaches `onEvent`, and without this line
 * a key-guessing run against a publicly reachable endpoint leaves no trace at
 * all. The caller is identified by the limiter's bucket rather than by the key,
 * which is only ever the last eight characters of it.
 */
export function mcpRefusedLogEntry(input: {
  caller: string
  reason: McpRefusedLogEntry['reason']
  retryAfter?: number
  time?: string
}): McpRefusedLogEntry {
  return {
    caller: input.caller,
    event: 'mcp_refused',
    level: 'warn',
    reason: input.reason,
    retryAfter: input.retryAfter ?? null,
    time: input.time ?? new Date().toISOString(),
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

/** What `mcp-handler` hands to `onEvent`, narrowed to the fields worth reading. */
type HandlerEvent = {
  context?: unknown
  duration?: unknown
  error?: unknown
  method?: unknown
  result?: unknown
  severity?: unknown
  source?: unknown
  status?: unknown
  type?: unknown
}

/**
 * The tool a `tools/call` asked for.
 *
 * `result` is the **request body**, not the response — `mcp-handler` passes the
 * parsed body straight to `requestCompleted`. So the tool name is available
 * here, and so are its arguments: an 8MB base64 image on an `uploadMedia` call,
 * the full text of an article on a drafting one. Only `params.name` is ever
 * read, and `params.arguments` must stay unread, or this line becomes the
 * largest thing in the log and carries content nobody asked to store.
 */
function toolName(event: HandlerEvent): string | null {
  if (event.method !== 'tools/call') return null
  const body = event.result
  if (typeof body !== 'object' || body === null) return null
  const params = (body as { params?: unknown }).params
  if (typeof params !== 'object' || params === null) return null
  return field((params as { name?: unknown }).name)
}

/**
 * One log line per MCP event, or null for events not worth a line.
 *
 * Only two event types actually arrive. The endpoint runs Streamable HTTP with
 * SSE disabled, which `mcp-handler` serves from a single stateless server with
 * no session id generator — so `SESSION_STARTED`, `SESSION_ENDED`, and
 * `REQUEST_RECEIVED` are never emitted on this path, and `sessionId` is always
 * undefined. `REQUEST_COMPLETED` is the whole of the request telemetry.
 *
 * Note that `status` is reported by the transport, not by the tool: a handler
 * that throws is caught by the MCP SDK and returned as a JSON-RPC error result,
 * which the transport still completes successfully. A refused publish is a
 * successful request that returned an error to the client, and reads as
 * `success` here. `mcp_write` is what says whether anything landed.
 */
export function mcpEventLogEntry(
  event: unknown,
  time: string = new Date().toISOString(),
): McpErrorLogEntry | McpRequestLogEntry | null {
  if (typeof event !== 'object' || event === null) return null
  const candidate = event as HandlerEvent

  if (candidate.type === 'REQUEST_COMPLETED') {
    return {
      durationMs:
        typeof candidate.duration === 'number' ? candidate.duration : null,
      event: 'mcp_request',
      level: 'info',
      method: field(candidate.method),
      status: field(candidate.status),
      time,
      tool: toolName(candidate),
    }
  }

  if (candidate.type === 'ERROR') {
    const error = candidate.error
    return {
      context: field(candidate.context),
      event: 'mcp_error',
      level: 'error',
      message: field(error instanceof Error ? error.message : error),
      severity: field(candidate.severity),
      source: field(candidate.source),
      time,
    }
  }

  return null
}

export function logMcpEvent(entry: McpLogEntry): void {
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
