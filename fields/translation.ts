// Per-language publishing state on a post.
//
// All localized, so each language has its own: the Spanish version can be a
// draft while the German one is live and English carries none of it. English
// is published the way it always was — `_status` and `publishedAt` — and
// ignores these. See `lib/i18n/publishing.ts` for why the status is a field of
// ours rather than Payload's experimental localized `_status`.

import type { Field } from 'payload'

import { TRANSLATION_STATUSES } from '../lib/i18n/publishing'

export function translationFields(): Field[] {
  return [
    {
      // The panel that says what this language's version is: missing, a
      // draft, live, scheduled — and whether English has moved on since it
      // was translated. Renders nothing in English.
      name: 'translationPanel',
      type: 'ui',
      admin: {
        position: 'sidebar',
        components: {
          Field: '/components/admin/TranslationPanel#TranslationPanel',
        },
      },
    },
    {
      name: 'translationStatus',
      label: 'Translation',
      type: 'select',
      localized: true,
      index: true,
      options: [
        { label: 'None', value: 'none' },
        { label: 'Draft — not on the site', value: 'draft' },
        { label: 'Published', value: 'published' },
      ] satisfies Array<{
        label: string
        value: (typeof TRANSLATION_STATUSES)[number]
      }>,
      admin: {
        position: 'sidebar',
        description:
          'Translations only — English ignores this. Set to Published and press Publish to put this language’s version on the site; set to Draft and publish to take it down. The English article must be published first.',
      },
    },
    {
      name: 'translationPublishedAt',
      label: 'Translation publish date',
      type: 'date',
      localized: true,
      index: true,
      admin: {
        position: 'sidebar',
        date: { pickerAppearance: 'dayAndTime' },
        description:
          'Translations only. Set ahead to schedule this language’s version, as the English publish date does. Left empty, it is filled in when the translation is published.',
      },
    },
    {
      // What lastmod, `dateModified` and `og:modified_time` read, per language.
      // `updatedAt` is shared by every language and moves on any publish, so a
      // Spanish publish would otherwise move the English URL's lastmod.
      name: 'modifiedAt',
      label: 'Last published change',
      type: 'date',
      localized: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description:
          'Set when this language’s version is published. Search engines are told this is when it last changed.',
      },
    },
    {
      name: 'translatedFrom',
      label: 'Translated from',
      type: 'group',
      localized: true,
      admin: {
        position: 'sidebar',
        description:
          'The English version this translation was made from. Compared with English’s last published change to tell whether the translation is behind.',
      },
      fields: [
        {
          name: 'version',
          label: 'English version id',
          type: 'text',
          admin: { readOnly: true },
        },
        {
          name: 'englishModifiedAt',
          label: 'English as of',
          type: 'date',
          admin: { readOnly: true },
        },
      ],
    },
  ]
}
