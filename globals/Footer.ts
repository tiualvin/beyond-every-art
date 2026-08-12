import type { GlobalConfig } from 'payload'

import { globalPublicReadAdminUpdate } from '../access/roles'
import { CONTENT_TAGS } from '../lib/cache/content'
import { purgeGlobalOnChange } from '../lib/cache/purge'

export const Footer: GlobalConfig = {
  slug: 'footer',
  access: globalPublicReadAdminUpdate,
  hooks: { afterChange: [purgeGlobalOnChange(CONTENT_TAGS.globals)] },
  fields: [
    { name: 'copyright', type: 'text' },
    {
      name: 'links',
      type: 'array',
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'url', type: 'text', required: true },
      ],
    },
  ],
}
