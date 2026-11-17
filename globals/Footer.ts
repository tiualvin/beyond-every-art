import type { GlobalConfig } from 'payload'

import { globalPublicReadAdminUpdate } from '../access/roles'
import { CONTENT_TAGS } from '../lib/cache/content'
import { purgeGlobalOnChange } from '../lib/cache/purge'

export const Footer: GlobalConfig = {
  slug: 'footer',
  access: globalPublicReadAdminUpdate,
  hooks: { afterChange: [purgeGlobalOnChange(CONTENT_TAGS.globals)] },
  fields: [
    // Per language; see the note on the header.
    { name: 'copyright', type: 'text', localized: true },
    {
      name: 'links',
      type: 'array',
      localized: true,
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'url', label: 'URL', type: 'text', required: true },
      ],
    },
  ],
}
