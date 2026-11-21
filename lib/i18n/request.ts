// The language of the page being rendered, as the middleware read it from the
// path.
//
// Routes know their language from their own params, and every data read takes
// it from there. This is for the parts of a page that have no params to read:
// the root layout, which sets `<html lang>` and the masthead around whatever
// page is under it, and the 404, which can be reached from any path.

import { headers } from 'next/headers'
import { cache } from 'react'

import {
  DEFAULT_LOCALE,
  isLocale,
  LOCALE_HEADER,
  localeOfPath,
  PATH_HEADER,
  type Locale,
} from './locales'

export const getRequestLocale = cache(async (): Promise<Locale> => {
  try {
    const list = await headers()
    const value = list.get(LOCALE_HEADER)
    if (isLocale(value)) return value
    const path = list.get(PATH_HEADER)
    return path ? localeOfPath(path) : DEFAULT_LOCALE
  } catch {
    return DEFAULT_LOCALE
  }
})

/** The path being rendered, or null outside a request. */
export const getRequestPath = cache(async (): Promise<string | null> => {
  try {
    return (await headers()).get(PATH_HEADER)
  } catch {
    return null
  }
})
