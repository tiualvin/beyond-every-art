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

import { DEFAULT_LOCALE, isPrefixedLocale } from '../lib/i18n/locales'
import {
  validateLocalizedContentSlug,
  validateRootContentSlug,
} from '../lib/seo/reserved-slugs'
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
  /**
   * Put the field in the sidebar rather than the document body.
   *
   * For the collections whose edit view is arranged around writing — Posts and
   * Pages. A slug is the document's address, which is a decision about it
   * rather than part of it, and it belongs beside the other publishing controls
   * instead of between the title and the excerpt.
   */
  sidebar?: boolean
  /**
   * One slug per language. Uniqueness then holds per locale — Postgres indexes
   * `(slug, _locale)` — so `/impressionism/` and `/es/impressionism/` can both
   * exist, and a translation's address is its own rather than English's.
   */
  localized?: boolean
}

export function slugField({
  reserved = false,
  from = 'title',
  sidebar = false,
  localized = false,
}: SlugFieldOptions = {}): TextField {
  return {
    name: 'slug',
    type: 'text',
    ...(localized ? { localized: true } : {}),
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
      //
      // A translation is the exception, and the reason is the same one turned
      // around: its slug in that language is empty until somebody sets it, so
      // filling it from the translated title on the first save in that locale
      // moves no address. It is transliterated (`más` → `mas`, German `ü` →
      // `ue`) because the English rule drops what it cannot spell.
      beforeValidate: [
        ({ data, operation, req, value }) => {
          if (typeof value === 'string' && value) return value
          const locale = req?.locale
          const translating = localized && isPrefixedLocale(locale)
          if (operation !== 'create' && !translating) return value
          const source = (data as Record<string, unknown> | undefined)?.[from]
          if (typeof source !== 'string' || !source) return value
          return (
            slugFromTitle(source, translating ? locale : DEFAULT_LOCALE) ||
            value
          )
        },
      ],
    },
    validate: ((value, { req }) => {
      // `required` reports an absent value; saying so twice is noise, and a
      // draft is allowed to be incomplete.
      if (!value) return true
      if (!isWellFormedSlug(value)) return slugFormatError(value)
      if (!reserved) return true
      // A translated slug lives under `/{locale}/`, not at the root, so the
      // root list does not apply to it — but the routes under every prefix do.
      return localized && isPrefixedLocale(req?.locale)
        ? validateLocalizedContentSlug(value)
        : validateRootContentSlug(value)
    }) as TextFieldSingleValidation,
    admin: {
      ...(sidebar ? { position: 'sidebar' as const } : {}),
      description:
        'Used verbatim as the URL. Lowercase letters, numbers and hyphens. Changing it on a published document changes a live address.',
    },
  }
}
