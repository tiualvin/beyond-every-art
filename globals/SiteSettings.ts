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
    { name: 'canonicalURL', label: 'Canonical URL', type: 'text' },
    {
      // The only image this global carries, and the only one on the site an
      // editor chooses outside a post. It fills the top of the signup card in
      // the post rail; `ArticleRail` renders the card without it when it is
      // unset, which is the state every existing database is in.
      name: 'newsletterImage',
      label: 'Newsletter card image',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description:
          'Sits above the signup in the article rail. The card is 300px wide ' +
          'and crops the image to 3:2, so a landscape frame with nothing ' +
          'important at the edges works best. Leave empty for a card with no ' +
          'image.',
      },
    },
  ],
}
