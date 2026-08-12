import type { GlobalConfig } from 'payload'

import { globalPublicReadAdminUpdate } from '../access/roles'
import { CONTENT_TAGS } from '../lib/cache/content'
import { purgeGlobalOnChange } from '../lib/cache/purge'

export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  access: globalPublicReadAdminUpdate,
  hooks: { afterChange: [purgeGlobalOnChange(CONTENT_TAGS.globals)] },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'description', type: 'textarea' },
    { name: 'canonicalURL', type: 'text' },
  ],
}
