// Whether a signup module's campaign is the one currently running, and what
// copy it contributes.
//
// Pure, and shared by the renderer and the server action deliberately. The
// module shows a campaign's heading only when the campaign is live, and the
// server attributes a submission to a campaign only when the campaign is live.
// Those must be the same judgement: a module showing last month's offer while
// the server files the signup under this month's is a reporting error nobody
// would find.

import type { SignupCampaign, SignupData } from '../../blocks/schema'

/** The copy a signup module renders, whatever its source. */
export type SignupCopy = {
  heading: string
  body: string
  submitLabel: string
  consentText: string
  privacyLink: string
  successMessage: string
  /** The live campaign this came from, or null for the module's own fields. */
  campaignId: string | null
}

const DEFAULT_HEADING = 'Stay close to the work'
const DEFAULT_SUBMIT = 'Subscribe'
const DEFAULT_CONSENT =
  'Occasional emails about new work. No spam, unsubscribe any time.'
const DEFAULT_SUCCESS =
  'You’re on the list. New stories arrive when they’re ready.'

/** A date field's value as a timestamp, or null when it is unset or unusable. */
function toTime(value: string | null | undefined): number | null {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? null : time
}

/**
 * Whether a campaign should be used right now.
 *
 * `active` is the editor's switch and the window is the schedule; both have to
 * agree. An unparseable date is treated as absent rather than as a closed
 * window — a typo in `endsAt` should not silently take a running campaign off
 * every page.
 */
export function isCampaignLive(
  campaign: SignupCampaign | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!campaign?.active) return false

  const startsAt = toTime(campaign.startsAt)
  if (startsAt !== null && now < startsAt) return false

  const endsAt = toTime(campaign.endsAt)
  if (endsAt !== null && now > endsAt) return false

  return true
}

/**
 * The campaign on a signup block, if the relationship was populated.
 *
 * A relationship comes back as a bare id when a query ran at a depth too
 * shallow to populate it — depth 0, or any future caller that forgets. That is
 * indistinguishable here from no campaign at all, and falling back to the
 * module's own copy is the right answer for both.
 */
export function toCampaign(
  value: SignupData['campaign'],
): SignupCampaign | null {
  if (!value || typeof value !== 'object') return null
  return value as SignupCampaign
}

/**
 * What a signup module should show, and what it should attribute to.
 *
 * A live campaign wins field by field rather than wholesale: a campaign with a
 * heading but no consent line should not blank the consent line. `campaignId`
 * is set only when the campaign is live, which is what stops a module from
 * attributing a submission to a campaign whose copy it is not showing.
 */
export function resolveSignupCopy(
  data: SignupData,
  now: number = Date.now(),
): SignupCopy {
  const campaign = toCampaign(data.campaign)
  const live = isCampaignLive(campaign, now) ? campaign : null

  const pick = (
    fromCampaign: string | null | undefined,
    fromBlock: string | null | undefined,
    fallback: string,
  ) => fromCampaign?.trim() || fromBlock?.trim() || fallback

  return {
    heading: pick(live?.heading, data.heading, DEFAULT_HEADING),
    body: pick(live?.body, data.body, ''),
    submitLabel: pick(live?.submitLabel, data.submitLabel, DEFAULT_SUBMIT),
    consentText: pick(live?.consentText, null, DEFAULT_CONSENT),
    privacyLink: pick(live?.privacyLink, null, ''),
    successMessage: pick(live?.successMessage, null, DEFAULT_SUCCESS),
    campaignId: live?.id != null ? String(live.id) : null,
  }
}
