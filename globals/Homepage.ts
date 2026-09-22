import type { GlobalConfig } from 'payload'

import { globalPublicReadAdminUpdate } from '../access/roles'
import { CONTENT_TAGS } from '../lib/cache/content'
import { purgeGlobalOnChange } from '../lib/cache/purge'
import { PICK_SLOTS } from '../lib/content/homepage'

/**
 * What an editor chooses about the homepage.
 *
 * Its own global rather than three more groups on `SiteSettings`, for two
 * reasons. `SiteSettings` is the site's identity — its name, its canonical
 * URL, its description — and it had already started collecting things that are
 * really homepage or article furniture. And an editor looking for the front
 * page looks for something called Homepage.
 *
 * **Every field here renders nothing when it is empty.** The homepage on the
 * day this ships looks exactly as it did the day before: the picks fall back to
 * the `featured` flag and then to recency, the pairing section is absent
 * entirely, and the cover keeps the wording that has been compiled into the
 * page since the redesign. Nothing has to be filled in for the deploy to be
 * safe, and filling any one of them in is a visible, reversible change.
 */
export const Homepage: GlobalConfig = {
  slug: 'homepage',
  admin: { group: 'Content' },
  access: globalPublicReadAdminUpdate,
  hooks: { afterChange: [purgeGlobalOnChange(CONTENT_TAGS.globals)] },
  fields: [
    {
      name: 'picks',
      label: "Editors' picks",
      type: 'relationship',
      relationTo: 'posts',
      hasMany: true,
      maxRows: PICK_SLOTS,
      admin: {
        description:
          'The articles under "Featured articles", in the order you want ' +
          'them. Leave this empty and the section falls back to posts ' +
          'marked Featured, then to the most recent — which is what it has ' +
          'always done. A draft or a scheduled post is skipped at render ' +
          'time rather than shown to a reader who cannot open it.',
      },
    },
    {
      name: 'pairing',
      label: 'Read together',
      type: 'group',
      admin: {
        description:
          'Two articles that argue better together than apart, and the ' +
          'reason they do. The section does not appear at all until both ' +
          'articles and the note are set.',
      },
      fields: [
        {
          name: 'title',
          type: 'text',
          admin: {
            description:
              'The heading for the pairing — what the two pieces amount to, ' +
              'not what they are about. "Two whites, one argument".',
          },
        },
        {
          name: 'note',
          type: 'textarea',
          admin: {
            description:
              'Why these two, in your own voice. It is printed under them ' +
              'and credited as an editor’s note, so write it as one.',
          },
        },
        {
          // Exactly two. One is not a pairing and three is a list; the module
          // is a two-column spread whose whole claim is that these two belong
          // beside each other.
          name: 'posts',
          label: 'The two articles',
          type: 'relationship',
          relationTo: 'posts',
          hasMany: true,
          minRows: 2,
          maxRows: 2,
        },
      ],
    },
    {
      name: 'cover',
      type: 'group',
      admin: {
        description:
          'The wording over the cover. Both fall back to what the site has ' +
          'always shown. This is the editorial headline, not the page ' +
          'title a search result shows — that one is preserved from ' +
          'Ghost and is deliberately not editable here.',
      },
      fields: [
        {
          name: 'kicker',
          type: 'text',
          admin: { description: 'Currently: An independent journal' },
        },
        {
          name: 'headline',
          type: 'text',
          admin: {
            description: 'Currently: What paintings are actually made of',
          },
        },
      ],
    },
  ],
}
