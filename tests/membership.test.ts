import { afterEach, describe, expect, it } from 'vitest'

import { checkoutUrl, PRICES, YEARLY_SAVING } from '../lib/membership'

const MONTHLY = 'NEXT_PUBLIC_CHECKOUT_URL_MONTHLY'
const YEARLY = 'NEXT_PUBLIC_CHECKOUT_URL_YEARLY'

afterEach(() => {
  delete process.env[MONTHLY]
  delete process.env[YEARLY]
})

describe('pricing', () => {
  it('states the yearly saving rather than making the reader work it out', () => {
    expect(YEARLY_SAVING).toBe(PRICES.monthly * 12 - PRICES.yearly)
    expect(YEARLY_SAVING).toBeGreaterThan(0)
  })
})

describe('checkoutUrl', () => {
  // The modal offers a payment button only when there is somewhere real to
  // send the reader; everything here is about not fabricating that.
  it('is absent until a payment link is configured', () => {
    expect(checkoutUrl('monthly')).toBeNull()
    expect(checkoutUrl('yearly')).toBeNull()
  })

  it('returns the link for the period asked for', () => {
    process.env[MONTHLY] = 'https://buy.stripe.com/monthly'
    process.env[YEARLY] = 'https://buy.stripe.com/yearly'
    expect(checkoutUrl('monthly')).toBe('https://buy.stripe.com/monthly')
    expect(checkoutUrl('yearly')).toBe('https://buy.stripe.com/yearly')
  })

  it('refuses anything that is not https', () => {
    process.env[MONTHLY] = 'javascript:alert(1)'
    expect(checkoutUrl('monthly')).toBeNull()

    process.env[MONTHLY] = 'http://buy.stripe.com/monthly'
    expect(checkoutUrl('monthly')).toBeNull()
  })

  it('treats an empty variable as unconfigured', () => {
    process.env[YEARLY] = ''
    expect(checkoutUrl('yearly')).toBeNull()
  })
})
