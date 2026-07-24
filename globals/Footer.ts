import type { GlobalConfig } from 'payload'

import { globalPublicReadAdminUpdate } from '../access/roles'

export const Footer: GlobalConfig = {
  slug: 'footer',
  access: globalPublicReadAdminUpdate,
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
