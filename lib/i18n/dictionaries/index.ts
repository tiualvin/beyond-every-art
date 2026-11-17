// Which dictionary a page reads. Static imports, so a client component can
// ask for one without a request: all four together are a few kilobytes.
//
// Typed as a record over every configured locale, so adding a language to
// `lib/i18n/locales.ts` without its dictionary is a compile error here.

import { DEFAULT_LOCALE, isLocale, type Locale } from '../locales'
import { de } from './de'
import { en, type Dictionary } from './en'
import { es } from './es'
import { id } from './id'

const DICTIONARIES: Record<Locale, Dictionary> = { en, es, id, de }

export type { Dictionary }

export function dictionaryFor(locale: string | null | undefined): Dictionary {
  return DICTIONARIES[isLocale(locale) ? locale : DEFAULT_LOCALE]
}
