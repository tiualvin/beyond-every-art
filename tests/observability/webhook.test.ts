import { describe, expect, it, vi } from 'vitest'

import {
  buildWebhookEntry,
  logWebhookProblem,
} from '../../lib/observability/webhook'

const NOW = new Date('2026-07-25T12:00:00.000Z')

describe('buildWebhookEntry', () => {
  it('matches the JSON line shape the other log events use', () => {
    expect(
      buildWebhookEntry({
        event: 'webhook_rejected',
        provider: 'stripe',
        reason: 'timestamp_outside_tolerance',
        now: NOW,
      }),
    ).toEqual({
      level: 'error',
      event: 'webhook_rejected',
      time: '2026-07-25T12:00:00.000Z',
      provider: 'stripe',
      reason: 'timestamp_outside_tolerance',
      eventID: null,
      eventType: null,
    })
  })

  it('warns rather than errors for an event that was stored but not resolved', () => {
    const entry = buildWebhookEntry({
      event: 'webhook_unresolved',
      provider: 'stripe',
      reason: 'Stripe read failed',
      eventID: 'evt_1',
      eventType: 'invoice.paid',
      now: NOW,
    })
    expect(entry.level).toBe('warn')
    expect(entry).toMatchObject({ eventID: 'evt_1', eventType: 'invoice.paid' })
  })
})

describe('logWebhookProblem', () => {
  it('emits one JSON line', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    logWebhookProblem({
      event: 'webhook_rejected',
      provider: 'stripe',
      reason: 'no_matching_signature',
      now: NOW,
    })
    expect(error).toHaveBeenCalledTimes(1)
    expect(JSON.parse(error.mock.calls[0][0] as string)).toMatchObject({
      event: 'webhook_rejected',
      reason: 'no_matching_signature',
    })
    error.mockRestore()
  })
})
