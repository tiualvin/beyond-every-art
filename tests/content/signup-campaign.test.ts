import { describe, expect, it } from 'vitest'

import {
  isCampaignLive,
  resolveSignupCopy,
  toCampaign,
} from '../../lib/content/signup-campaign'

const NOW = Date.parse('2026-06-15T12:00:00.000Z')

const campaign = (overrides: Record<string, unknown> = {}) => ({
  id: 7,
  slug: 'summer-reading',
  heading: 'Read with us this summer',
  active: true,
  ...overrides,
})

describe('isCampaignLive', () => {
  it('needs the switch on', () => {
    expect(isCampaignLive(campaign(), NOW)).toBe(true)
    expect(isCampaignLive(campaign({ active: false }), NOW)).toBe(false)
    expect(isCampaignLive(null, NOW)).toBe(false)
  })

  it('respects a start and an end date', () => {
    expect(
      isCampaignLive(campaign({ startsAt: '2026-07-01T00:00:00.000Z' }), NOW),
    ).toBe(false)
    expect(
      isCampaignLive(campaign({ endsAt: '2026-06-01T00:00:00.000Z' }), NOW),
    ).toBe(false)
    expect(
      isCampaignLive(
        campaign({
          startsAt: '2026-06-01T00:00:00.000Z',
          endsAt: '2026-07-01T00:00:00.000Z',
        }),
        NOW,
      ),
    ).toBe(true)
  })

  it('treats an unparseable date as absent rather than as a closed window', () => {
    // A typo in `endsAt` should not silently pull a running campaign off every
    // page it appears on.
    expect(isCampaignLive(campaign({ endsAt: 'soon' }), NOW)).toBe(true)
    expect(isCampaignLive(campaign({ startsAt: '' }), NOW)).toBe(true)
  })
})

describe('toCampaign', () => {
  it('is null for an unpopulated relationship', () => {
    // A relationship comes back as a bare id at depth 0, which is
    // indistinguishable from no campaign — and the fallback is right for both.
    expect(toCampaign(7)).toBeNull()
    expect(toCampaign('7')).toBeNull()
    expect(toCampaign(null)).toBeNull()
  })

  it('is the record when it was populated', () => {
    expect(toCampaign(campaign())?.slug).toBe('summer-reading')
  })
})

describe('resolveSignupCopy', () => {
  const block = {
    heading: 'The block’s own heading',
    body: 'The block’s own line.',
    submitLabel: 'Join',
  }

  it('uses the block’s own copy with no campaign', () => {
    const copy = resolveSignupCopy(block, NOW)

    expect(copy.heading).toBe('The block’s own heading')
    expect(copy.submitLabel).toBe('Join')
    expect(copy.campaignId).toBeNull()
  })

  it('lets a live campaign win, field by field', () => {
    // A campaign with a heading but no consent line must not blank the
    // consent line.
    const copy = resolveSignupCopy(
      { ...block, campaign: campaign({ body: null }) },
      NOW,
    )

    expect(copy.heading).toBe('Read with us this summer')
    expect(copy.body).toBe('The block’s own line.')
    expect(copy.submitLabel).toBe('Join')
    expect(copy.consentText).toContain('unsubscribe')
    expect(copy.campaignId).toBe('7')
  })

  it('falls back completely once the campaign stops running', () => {
    // And crucially reports no campaign id, so the server cannot file the
    // signup under a campaign whose copy the reader was never shown.
    const copy = resolveSignupCopy(
      { ...block, campaign: campaign({ active: false }) },
      NOW,
    )

    expect(copy.heading).toBe('The block’s own heading')
    expect(copy.campaignId).toBeNull()
  })

  it('has a default for every field a draft has not filled in', () => {
    const copy = resolveSignupCopy({}, NOW)

    expect(copy.heading).toBe('Stay close to the work')
    expect(copy.submitLabel).toBe('Subscribe')
    expect(copy.successMessage).toContain('on the list')
    expect(copy.body).toBe('')
    expect(copy.privacyLink).toBe('')
  })
})
