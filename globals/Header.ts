import type { GlobalConfig } from 'payload'

import { globalPublicReadAdminUpdate } from '../access/roles'

export const Header: GlobalConfig = {
  slug: 'header',
  access: globalPublicReadAdminUpdate,
  fields: [
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
