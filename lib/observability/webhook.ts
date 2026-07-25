// Structured logging for billing webhooks.
//
// A provider dashboard shows failures, but only to whoever remembers to look:
// Stripe retries a failing endpoint for about three days and can then disable
// it, and by the time that happens subscription state has silently stopped
// tracking reality. Emitting one JSON line per rejected or unresolved event
// puts those failures in `docker compose logs app` next to the existing
// `request_error` and `not_found` lines, where the same collector can alert.
//
// Nothing here logs a request body, a signature header, or an email address:
// the line has to be safe to keep in an ordinary log store.

export type WebhookEvent =
  /** Signature, payload, or configuration problem; the request was refused. */
  | 'webhook_rejected'
  /** Verified and stored, but the current state could not be determined. */
  | 'webhook_unresolved'
  /** Verified but not storable — the provider should retry. */
  | 'webhook_storage_failed'

export interface WebhookLogEntry {
  level: 'warn' | 'error'
  event: WebhookEvent
  time: string
  provider: string
  reason: string
  eventID: string | null
  eventType: string | null
}

export interface WebhookLogInput {
  event: WebhookEvent
  provider: string
  reason: string
  eventID?: string | null
  eventType?: string | null
  now?: Date
}

/** Build the structured entry for a webhook problem. */
export function buildWebhookEntry(input: WebhookLogInput): WebhookLogEntry {
  return {
    level: input.event === 'webhook_unresolved' ? 'warn' : 'error',
    event: input.event,
    time: (input.now ?? new Date()).toISOString(),
    provider: input.provider,
    reason: input.reason,
    eventID: input.eventID ?? null,
    eventType: input.eventType ?? null,
  }
}

/** Emit one JSON line. Never throws: logging must not fail a webhook. */
export function logWebhookProblem(input: WebhookLogInput): void {
  try {
    const entry = buildWebhookEntry(input)
    const line = JSON.stringify(entry)
    if (entry.level === 'warn') console.warn(line)
    else console.error(line)
  } catch {
    // Observability is best effort.
  }
}
