import type { GlobalConfig } from 'payload'

import { globalPublicReadAdminUpdate } from '../access/roles'

export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  access: globalPublicReadAdminUpdate,
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'description', type: 'textarea' },
    { name: 'canonicalURL', type: 'text' },
  ],
}
