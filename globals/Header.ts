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
    {
      name: 'cta',
      type: 'group',
      admin: {
        description:
          'High-emphasis button at the end of the masthead. Set both fields to show it.',
      },
      fields: [
        { name: 'label', type: 'text' },
        { name: 'url', type: 'text' },
      ],
    },
  ],
}
