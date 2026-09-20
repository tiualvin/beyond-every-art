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
    {
      // What fills the rail's 300x250 when Google does not. An ad network
      // declines impressions routinely — no demand, no consent, a blocker —
      // and the slot holds its height either way, so without this the reader
      // gets a labelled empty box. `kind` rather than "is it a post or an
      // app": the answer is a third thing today and may be a fourth later,
      // and a boolean would have to be rewritten to say so.
      name: 'railFallback',
      label: 'Article rail — when no ad is shown',
      type: 'group',
      admin: {
        description:
          'The rail reserves a 300x250 box for an ad. When none is served, ' +
          'this is what goes there instead. It never competes with an ad: it ' +
          'appears only once the slot is known to be empty.',
      },
      fields: [
        {
          name: 'kind',
          label: 'Show',
          type: 'select',
          defaultValue: 'none',
          options: [
            { label: 'Nothing — leave the space empty', value: 'none' },
            { label: 'An article', value: 'post' },
            { label: 'One of the apps', value: 'app' },
          ],
        },
        {
          // Up to three, because the box is 250px tall and one headline in it
          // reads as a mistake rather than as a choice. One is still fine —
          // it is shown with its excerpt so it fills the space as a featured
          // piece rather than floating in the middle of it.
          name: 'posts',
          label: 'Articles to promote',
          type: 'relationship',
          relationTo: 'posts',
          hasMany: true,
          maxRows: 3,
          admin: {
            condition: (_, siblingData) => siblingData?.kind === 'post',
            description:
              'One to three published posts, in the order you want them. ' +
              'Members-only posts are fine — those are listed everywhere ' +
              'else on the site too. A draft is skipped at render time ' +
              'rather than shown to a reader who cannot open it.',
          },
        },
        {
          name: 'app',
          label: 'App to promote',
          type: 'relationship',
          relationTo: 'apps',
          admin: {
            condition: (_, siblingData) => siblingData?.kind === 'app',
            description: 'Any published app. Its name and tagline are used.',
          },
        },
      ],
    },
  ],
}
