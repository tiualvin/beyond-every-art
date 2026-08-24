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
  /**
   * Include the per-document "hide from search" switch.
   *
   * For collections whose documents can legitimately exist without wanting to
   * rank — articles and pages. An archive or an author page is part of the
   * site's own navigation, and hiding one from search while still linking to
   * it from every article is a contradiction rather than a setting.
   */
  noindex?: boolean
}

export function seoFields({
  canonical = false,
  noindex = false,
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
    ...(noindex
      ? ([
          {
            name: 'noindex',
            label: 'Hide from search engines',
            type: 'checkbox',
            defaultValue: false,
            admin: {
              description:
                'Keeps this out of search results and the sitemap. For campaign and advertising landing pages, which otherwise compete with the articles they were written to support. Links on the page still count.',
              position: 'sidebar',
            },
          },
        ] as Field[])
      : []),
  ]
}
