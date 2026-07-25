import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resendAdapter, toAddresses } from '../../lib/email/resend'

describe('toAddresses', () => {
  it('normalizes strings, objects, and arrays', () => {
    expect(toAddresses('a@example.com')).toEqual(['a@example.com'])
    expect(toAddresses({ address: 'a@example.com', name: 'A' })).toEqual([
      'A <a@example.com>',
    ])
    expect(
      toAddresses(['a@example.com', { address: 'b@example.com' }]),
    ).toEqual(['a@example.com', 'b@example.com'])
  })

  it('returns an empty array for empty input', () => {
    expect(toAddresses(undefined)).toEqual([])
  })
})

describe('resendAdapter', () => {
  const original = { ...process.env }

  beforeEach(() => {
    delete process.env.RESEND_API_KEY
    delete process.env.EMAIL_FROM_ADDRESS
    delete process.env.EMAIL_FROM_NAME
  })
  afterEach(() => {
    process.env = { ...original }
    vi.restoreAllMocks()
  })

  it('returns null when not configured', () => {
    expect(resendAdapter()).toBeNull()
    process.env.RESEND_API_KEY = 'key'
    expect(resendAdapter()).toBeNull() // still missing from address
  })

  it('sends a well-formed request to Resend when configured', async () => {
    process.env.RESEND_API_KEY = 'test-key'
    process.env.EMAIL_FROM_ADDRESS = 'hello@beyondeveryart.com'
    process.env.EMAIL_FROM_NAME = 'BEA'

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ id: 'abc' }), { status: 200 }),
      )

    const adapter = resendAdapter()
    expect(adapter).not.toBeNull()
    const initialized = adapter!({ payload: {} as never })
    expect(initialized.defaultFromAddress).toBe('hello@beyondeveryart.com')
    expect(initialized.defaultFromName).toBe('BEA')

    await initialized.sendEmail({
      to: 'reader@example.com',
      subject: 'Reset your password',
      html: '<p>link</p>',
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body).toMatchObject({
      from: 'BEA <hello@beyondeveryart.com>',
      to: ['reader@example.com'],
      subject: 'Reset your password',
      html: '<p>link</p>',
    })
    expect((init as RequestInit).headers).toMatchObject({
      authorization: 'Bearer test-key',
    })
  })

  it('throws with detail when Resend responds with an error', async () => {
    process.env.RESEND_API_KEY = 'test-key'
    process.env.EMAIL_FROM_ADDRESS = 'hello@beyondeveryart.com'
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('domain not verified', { status: 403 }),
    )
    const initialized = resendAdapter()!({ payload: {} as never })
    await expect(
      initialized.sendEmail({ to: 'x@example.com', subject: 'hi' }),
    ).rejects.toThrow('Resend send failed: 403')
  })
})
