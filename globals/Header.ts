import type { GlobalConfig } from 'payload'

import { globalPublicReadAdminUpdate } from '../access/roles'
import { CONTENT_TAGS } from '../lib/cache/content'
import { purgeGlobalOnChange } from '../lib/cache/purge'

export const Header: GlobalConfig = {
  slug: 'header',
  access: globalPublicReadAdminUpdate,
  hooks: { afterChange: [purgeGlobalOnChange(CONTENT_TAGS.globals)] },
  // Per language, as whole lists: a Spanish masthead links to Spanish pages,
  // and a language with no list of its own uses the default navigation from
  // its dictionary rather than English labels.
  fields: [
    {
      name: 'links',
      type: 'array',
      localized: true,
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'url', label: 'URL', type: 'text', required: true },
      ],
    },
    {
      name: 'cta',
      type: 'group',
      localized: true,
      admin: {
        description:
          'High-emphasis button at the end of the masthead. Set both fields to show it.',
      },
      fields: [
        { name: 'label', type: 'text' },
        { name: 'url', label: 'URL', type: 'text' },
      ],
    },
  ],
}
