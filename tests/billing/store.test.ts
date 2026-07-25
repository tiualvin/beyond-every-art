import type { Payload } from 'payload'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  applyObservation,
  latestResolvedState,
  markEvent,
  recordBillingEvent,
} from '../../lib/billing/store'
import { stateFromSubscription } from '../../lib/billing/subscription-state'

// A stand-in for Payload's Local API: enough of find/create/update to exercise
// the store's real code paths, including the unique index on `eventKey` that
// makes duplicate delivery a no-op.

interface Doc extends Record<string, unknown> {
  id: number
  eventKey: string
}

type Condition = { equals?: unknown }
type Where = Record<string, Condition> & { and?: Record<string, Condition>[] }

function matches(doc: Doc, where: Where | undefined): boolean {
  if (!where) return true
  const clauses = where.and ?? [where]
  return clauses.every((clause) =>
    Object.entries(clause).every(([field, condition]) => {
      if (field === 'and') return true
      return doc[field] === (condition as Condition).equals
    }),
  )
}

function fakePayload() {
  const docs: Doc[] = []
  let nextID = 1

  const client = {
    find: async ({
      where,
      sort,
      limit,
    }: {
      where?: Where
      sort?: string
      limit?: number
    }) => {
      let found = docs.filter((doc) => matches(doc, where))
      if (sort === '-occurredAt') {
        found = [...found].sort((a, b) =>
          String(b.occurredAt).localeCompare(String(a.occurredAt)),
        )
      }
      return { docs: limit ? found.slice(0, limit) : found }
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const eventKey = String(data.eventKey)
      if (docs.some((doc) => doc.eventKey === eventKey)) {
        throw new Error('duplicate key value violates unique constraint')
      }
      const doc = { ...data, eventKey, id: nextID++ } as Doc
      docs.push(doc)
      return doc
    },
    update: async ({
      id,
      data,
    }: {
      id: number | string
      data: Record<string, unknown>
    }) => {
      const doc = docs.find((candidate) => candidate.id === Number(id))
      if (!doc) throw new Error(`No billing event ${id}`)
      Object.assign(doc, data)
      return doc
    },
  }

  return { docs, payload: client as unknown as Payload }
}

const PERIOD_END = 1_785_542_400 // 2026-08-01T00:00:00Z

function webhookEvent(eventID: string, occurredAt: string) {
  return {
    provider: 'stripe' as const,
    eventID,
    type: 'customer.subscription.updated',
    occurredAt,
    livemode: true,
    source: 'webhook' as const,
    rawEvent: { id: eventID },
    subscriptionID: 'sub_1',
    customerID: 'cus_1',
  }
}

describe('recordBillingEvent', () => {
  let fake: ReturnType<typeof fakePayload>

  beforeEach(() => {
    fake = fakePayload()
  })

  it('stores a new event under provider:eventID', async () => {
    const recorded = await recordBillingEvent(
      fake.payload,
      webhookEvent('evt_1', '2026-07-25T12:00:00.000Z'),
    )

    expect(recorded).toMatchObject({
      duplicate: false,
      processingState: 'stored',
    })
    expect(fake.docs).toHaveLength(1)
    expect(fake.docs[0].eventKey).toBe('stripe:evt_1')
    expect(fake.docs[0].rawEvent).toEqual({ id: 'evt_1' })
  })

  it('treats a redelivery as a duplicate and writes nothing', async () => {
    const input = webhookEvent('evt_1', '2026-07-25T12:00:00.000Z')
    const first = await recordBillingEvent(fake.payload, input)
    const second = await recordBillingEvent(fake.payload, input)

    expect(first.duplicate).toBe(false)
    expect(second).toMatchObject({ id: first.id, duplicate: true })
    expect(fake.docs).toHaveLength(1)
  })

  it('falls back to the stored row when the unique index rejects a race', async () => {
    // Two concurrent deliveries: the lookup misses, the insert loses, and the
    // handler must still answer 200 rather than fail the delivery.
    const input = webhookEvent('evt_race', '2026-07-25T12:00:00.000Z')
    await fake.payload.create({
      collection: 'billing-events',
      data: {
        ...input,
        eventKey: 'stripe:evt_race',
        processingState: 'stored',
      },
    })

    const raced = await recordBillingEvent(fake.payload, input)
    expect(raced.duplicate).toBe(true)
    expect(fake.docs).toHaveLength(1)
  })

  it('rethrows failures that are not a duplicate', async () => {
    const broken = {
      find: async () => ({ docs: [] }),
      create: async () => {
        throw new Error('connection terminated')
      },
    } as unknown as Payload

    await expect(
      recordBillingEvent(
        broken,
        webhookEvent('evt_2', '2026-07-25T12:00:00.000Z'),
      ),
    ).rejects.toThrow(/connection terminated/)
  })
})

describe('applyObservation', () => {
  let fake: ReturnType<typeof fakePayload>

  beforeEach(() => {
    fake = fakePayload()
  })

  async function observe(
    eventID: string,
    occurredAt: string,
    status: string,
  ): Promise<void> {
    const recorded = await recordBillingEvent(
      fake.payload,
      webhookEvent(eventID, occurredAt),
    )
    await applyObservation(
      fake.payload,
      recorded.id,
      stateFromSubscription(
        {
          id: 'sub_1',
          status,
          customer: 'cus_1',
          current_period_end: PERIOD_END,
          ended_at: status === 'canceled' ? PERIOD_END : undefined,
        },
        { observedAt: occurredAt, eventID },
      ),
    )
  }

  it('resolves the first observation of a subscription', async () => {
    await observe('evt_1', '2026-07-25T12:00:00.000Z', 'active')

    expect(fake.docs[0]).toMatchObject({
      processingState: 'resolved',
      resolvedStatus: 'active',
      expiresAt: '2026-08-01T00:00:00.000Z',
      customerID: 'cus_1',
      subscriptionID: 'sub_1',
    })
    expect(await latestResolvedState(fake.payload, 'sub_1')).toMatchObject({
      subscriptionStatus: 'active',
      eventID: 'evt_1',
    })
  })

  it('does not let a late event overwrite newer state', async () => {
    // The cancellation lands first; the renewal that preceded it arrives after.
    await observe('evt_cancel', '2026-07-25T13:00:00.000Z', 'canceled')
    await observe('evt_late_renewal', '2026-07-25T12:00:00.000Z', 'active')

    const [cancellation, lateRenewal] = fake.docs
    expect(cancellation.processingState).toBe('resolved')
    expect(lateRenewal.processingState).toBe('superseded')
    expect(lateRenewal.note).toMatch(/Not applied: stale/)

    // The subscription is still expired: the late renewal did not resurrect it.
    expect(await latestResolvedState(fake.payload, 'sub_1')).toMatchObject({
      subscriptionStatus: 'expired',
      eventID: 'evt_cancel',
    })
  })

  it('applies a genuinely newer event', async () => {
    await observe('evt_1', '2026-07-25T12:00:00.000Z', 'active')
    await observe('evt_2', '2026-07-25T13:00:00.000Z', 'canceled')

    expect(await latestResolvedState(fake.payload, 'sub_1')).toMatchObject({
      subscriptionStatus: 'expired',
      eventID: 'evt_2',
    })
  })
})

describe('markEvent', () => {
  it('records why an event was not acted on', async () => {
    const fake = fakePayload()
    const recorded = await recordBillingEvent(
      fake.payload,
      webhookEvent('evt_1', '2026-07-25T12:00:00.000Z'),
    )

    await markEvent(fake.payload, recorded.id, 'ignored', 'No handler.')

    expect(fake.docs[0]).toMatchObject({
      processingState: 'ignored',
      note: 'No handler.',
    })
  })
})

describe('latestResolvedState', () => {
  it('returns null before anything has been resolved', async () => {
    const fake = fakePayload()
    await recordBillingEvent(
      fake.payload,
      webhookEvent('evt_1', '2026-07-25T12:00:00.000Z'),
    )
    expect(await latestResolvedState(fake.payload, 'sub_1')).toBeNull()
  })
})
