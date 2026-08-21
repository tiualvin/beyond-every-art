// The one definition of a slug field.
//
// Seven collections had their own, and they had drifted: Posts and Pages
// validated against the reserved-route list while Tags, Authors and Apps
// validated nothing at all, so `My Tag!` was accepted by three of them and
// became a broken `/tag/My%20Tag!`. Nothing about that difference was
// intentional — it is what happens when the same field is written out five
// times — so the shape lives here now and the differences that *are*
// intentional are arguments.

import type { TextField, TextFieldSingleValidation } from 'payload'

import { validateRootContentSlug } from '../lib/seo/reserved-slugs'
import {
  isWellFormedSlug,
  slugFormatError,
  slugFromTitle,
} from '../lib/seo/slug-format'

type SlugFieldOptions = {
  /**
   * Also refuse slugs owned by an application route.
   *
   * Only for collections that live at the root — Posts and Pages. Apps, tags
   * and authors sit under a path prefix (`/apps/…`, `/tag/…`, `/author/…`), so
   * an app called "journal" collides with nothing; refusing it would be a rule
   * invented for symmetry rather than for a URL.
   */
  reserved?: boolean
  /** Field to derive an empty slug from on create. */
  from?: string
}

export function slugField({
  reserved = false,
  from = 'title',
}: SlugFieldOptions = {}): TextField {
  return {
    name: 'slug',
    type: 'text',
    required: true,
    unique: true,
    index: true,
    hooks: {
      // Fills an empty slug from the title, on create only.
      //
      // A convenience for a new document and nothing more. It cannot touch an
      // existing one, because on update the slug is a live URL and deriving a
      // "better" one from an edited title is how a published article silently
      // changes address. It also cannot touch a value somebody supplied — the
      // importer passes Ghost's own slug, which is the whole point of the
      // migration, and this must not have an opinion about it.
      beforeValidate: [
        ({ data, operation, value }) => {
          if (operation !== 'create' || (typeof value === 'string' && value)) {
            return value
          }
          const source = (data as Record<string, unknown> | undefined)?.[from]
          if (typeof source !== 'string' || !source) return value
          return slugFromTitle(source) || value
        },
      ],
    },
    validate: ((value) => {
      // `required` reports an absent value; saying so twice is noise, and a
      // draft is allowed to be incomplete.
      if (!value) return true
      if (!isWellFormedSlug(value)) return slugFormatError(value)
      return reserved ? validateRootContentSlug(value) : true
    }) as TextFieldSingleValidation,
    admin: {
      description:
        'Used verbatim as the URL. Lowercase letters, numbers and hyphens.',
    },
  }
}
