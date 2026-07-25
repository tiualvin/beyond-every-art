import { describe, expect, it, vi } from 'vitest'

import {
  isTestModeKey,
  listAccessGrantingSubscriptions,
  listSubscriptionsByStatus,
  resolveStripeConfig,
  retrieveSubscription,
} from '../../lib/billing/stripe-api'

const config = resolveStripeConfig({ STRIPE_SECRET_KEY: 'sk_test_123' })

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

describe('resolveStripeConfig', () => {
  it('names the missing variable', () => {
    expect(() => resolveStripeConfig({})).toThrow(/STRIPE_SECRET_KEY/)
  })

  it('defaults the API base and leaves the version to the account', () => {
    expect(config.apiBase).toBe('https://api.stripe.com/v1')
    expect(config.apiVersion).toBeUndefined()
  })

  it('allows the base and version to be overridden', () => {
    const custom = resolveStripeConfig({
      STRIPE_SECRET_KEY: 'sk_live_1',
      STRIPE_API_BASE: 'http://localhost:12111/v1/',
      STRIPE_API_VERSION: '2026-01-01',
    })
    expect(custom.apiBase).toBe('http://localhost:12111/v1')
    expect(custom.apiVersion).toBe('2026-01-01')
  })
})

describe('isTestModeKey', () => {
  it('distinguishes test keys from live ones', () => {
    expect(isTestModeKey(config)).toBe(true)
    expect(
      isTestModeKey(resolveStripeConfig({ STRIPE_SECRET_KEY: 'sk_live_1' })),
    ).toBe(false)
  })
})

describe('retrieveSubscription', () => {
  it('authenticates with the secret key and reads the subscription', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({ id: 'sub_1', status: 'active', customer: 'cus_1' }),
      )

    const subscription = await retrieveSubscription(config, 'sub_1', fetchMock)

    expect(subscription.status).toBe('active')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.stripe.com/v1/subscriptions/sub_1')
    expect((init?.headers as Record<string, string>).authorization).toBe(
      'Bearer sk_test_123',
    )
  })

  it('surfaces the status and body when Stripe refuses', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('{"error":{"message":"No such subscription"}}', {
        status: 404,
        statusText: 'Not Found',
      }),
    )

    await expect(
      retrieveSubscription(config, 'sub_missing', fetchMock),
    ).rejects.toThrow(/404 Not Found[\s\S]*No such subscription/)
  })
})

describe('listSubscriptionsByStatus', () => {
  it('follows pagination to the end', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: 'sub_1', status: 'active', customer: 'cus_1' }],
          has_more: true,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: 'sub_2', status: 'active', customer: 'cus_2' }],
          has_more: false,
        }),
      )

    const subscriptions = await listSubscriptionsByStatus(
      config,
      'active',
      fetchMock,
    )

    expect(subscriptions.map((subscription) => subscription.id)).toEqual([
      'sub_1',
      'sub_2',
    ])
    expect(String(fetchMock.mock.calls[0][0])).toContain('status=active')
    // The second page continues after the last ID of the first.
    expect(String(fetchMock.mock.calls[1][0])).toContain('starting_after=sub_1')
  })

  it('stops when a page comes back empty', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ data: [], has_more: true }))

    await expect(
      listSubscriptionsByStatus(config, 'active', fetchMock),
    ).resolves.toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('listAccessGrantingSubscriptions', () => {
  it('queries every status that grants access and merges the results', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((input) => {
      const url = String(input)
      if (url.includes('status=active')) {
        return Promise.resolve(
          jsonResponse({
            data: [{ id: 'sub_1', status: 'active', customer: 'cus_1' }],
          }),
        )
      }
      if (url.includes('status=trialing')) {
        return Promise.resolve(
          jsonResponse({
            data: [{ id: 'sub_2', status: 'trialing', customer: 'cus_2' }],
          }),
        )
      }
      return Promise.resolve(
        jsonResponse({
          data: [{ id: 'sub_3', status: 'past_due', customer: 'cus_3' }],
        }),
      )
    })

    const subscriptions = await listAccessGrantingSubscriptions(
      config,
      fetchMock,
    )

    // `status=active` alone would miss the trialing and dunning subscribers our
    // mapping still counts as active.
    expect(subscriptions.map((subscription) => subscription.id).sort()).toEqual(
      ['sub_1', 'sub_2', 'sub_3'],
    )
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
