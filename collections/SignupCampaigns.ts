import type { CollectionConfig } from 'payload'

import { editorsAndAdmins } from '../access/roles'
import { slugField } from '../fields/slug'

/**
 * A named newsletter offer that signup modules point at.
 *
 * The reason this is a collection rather than more fields on the block: a
 * campaign runs across many placements, and its copy, its consent line and the
 * date it stops are facts about the campaign, not about the article that
 * happens to carry it. Editing thirty articles to end a campaign is how a
 * campaign quietly outlives itself.
 *
 * It is also what makes per-campaign attribution honest. A signup module can
 * name the campaign it belongs to, and the server reads the source *from this
 * record* — never from the form. A hidden input naming its own attribution is
 * a value the server would be trusting the client to tell it, which is the
 * reason `subscribeFromArticle` reported one flat source until now.
 *
 * Deliberately no provider list id. There is no sending platform wired up, and
 * a field for a system that does not exist invites somebody to fill it with a
 * value nothing reads.
 */
export const SignupCampaigns: CollectionConfig = {
  slug: 'signup-campaigns',
  admin: {
    group: 'Audience',
    useAsTitle: 'internalName',
    defaultColumns: ['internalName', 'slug', 'active', 'endsAt'],
    description:
      'Reusable newsletter offers. A signup module points at one; ending it here ends it everywhere.',
  },
  access: {
    create: editorsAndAdmins,
    update: editorsAndAdmins,
    delete: editorsAndAdmins,
    // Every field is copy that appears on a public page, so there is nothing
    // here to withhold from a reader. What is withheld is the *unlaunched*
    // ones: a campaign that has not started is an editorial plan, and the API
    // should not list next month's offer to anyone who asks.
    read: ({ req }) => (req.user ? true : { active: { equals: true } }),
  },
  fields: [
    {
      name: 'internalName',
      type: 'text',
      required: true,
      admin: {
        description:
          'How this campaign is listed here. Never shown to a reader.',
      },
    },
    // Not a URL — a campaign has no page. The slug is the stable name that
    // ends up in a signup's `source`, which is why it must not change once
    // submissions have been attributed to it.
    slugField({ from: 'internalName' }),
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description:
          'Off until the campaign should run. A module pointing at an inactive campaign falls back to its own copy.',
        position: 'sidebar',
      },
    },
    {
      name: 'startsAt',
      type: 'date',
      admin: {
        description: 'Optional. Before this, the campaign is not used.',
        position: 'sidebar',
      },
    },
    {
      name: 'endsAt',
      type: 'date',
      admin: {
        description:
          'Optional. After this, every module pointing here quietly falls back to its own copy.',
        position: 'sidebar',
      },
    },
    { name: 'heading', type: 'text', required: true },
    {
      name: 'body',
      type: 'textarea',
      admin: { description: 'One or two lines under the heading.' },
    },
    { name: 'submitLabel', type: 'text', defaultValue: 'Subscribe' },
    {
      name: 'successMessage',
      type: 'textarea',
      admin: {
        description: 'Shown in place of the form once somebody has signed up.',
      },
    },
    {
      name: 'consentText',
      type: 'textarea',
      admin: {
        description:
          'The line beside the form saying what someone is agreeing to.',
      },
    },
    {
      name: 'privacyLink',
      type: 'text',
      admin: {
        description:
          'Optional path or https:// URL for a privacy policy, linked from the consent line.',
      },
      validate: (value: string | null | undefined) => {
        const raw = (value ?? '').trim()
        if (!raw) return true
        if (raw.startsWith('/')) return true
        try {
          if (new URL(raw).protocol === 'https:') return true
        } catch {
          return 'That is not a valid path or URL.'
        }
        return 'Links must be a relative path or use https://.'
      },
    },
  ],
}
