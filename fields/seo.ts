// The search-and-sharing metadata block, written once.
//
// Four collections carried their own copy of these fields. They agreed, which
// is the only reason nothing had broken yet — the next one added to Posts and
// forgotten on Pages would have shown up as a missing `<meta>` tag on half the
// site, in an area where nothing fails loudly and a mistake is measured in
// weeks of search results.

import type { Field } from 'payload'

type SeoFieldsOptions = {
  /**
   * Include the canonical URL override.
   *
   * For collections whose documents can legitimately be republished from
   * somewhere else — articles and pages. A tag archive or an app page is
   * canonical here by definition, so offering the field would only be offering
   * a way to point a live URL at somebody else's.
   */
  canonical?: boolean
}

export function seoFields({
  canonical = false,
}: SeoFieldsOptions = {}): Field[] {
  return [
    {
      name: 'metaTitle',
      type: 'text',
      admin: {
        description:
          'Overrides the title in search results and share cards. Falls back to the title above.',
      },
    },
    {
      name: 'metaDescription',
      type: 'textarea',
      admin: {
        description:
          'The snippet under the title in search results. Around 155 characters.',
      },
    },
    ...(canonical
      ? ([
          {
            name: 'canonicalURL',
            label: 'Canonical URL',
            type: 'text',
            admin: {
              description:
                'Only when this was first published elsewhere. Points search engines at the original.',
            },
          },
        ] as Field[])
      : []),
  ]
}
