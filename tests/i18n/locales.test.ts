import { describe, expect, it } from 'vitest'

import {
  DEFAULT_LOCALE,
  LOCALE_CODES,
  isPrefixedLocale,
  localeOfPath,
  localizePath,
} from '../../lib/i18n/locales'
import {
  isReservedRootSlug,
  validateLocalizedContentSlug,
  validateRootContentSlug,
} from '../../lib/seo/reserved-slugs'
import { slugFromTitle, transliterate } from '../../lib/seo/slug-format'
import {
  localeFeedPath,
  localeHomePath,
  localePostPath,
  localeTagPath,
  postPath,
  tagPath,
} from '../../lib/seo/site'

describe('locale registry', () => {
  it('launches with English plus es, id and de, language codes only', () => {
    expect(DEFAULT_LOCALE).toBe('en')
    expect(LOCALE_CODES).toEqual(['en', 'es', 'id', 'de'])
    for (const code of LOCALE_CODES) expect(code).toMatch(/^[a-z]{2}$/)
  })

  it('never prefixes English', () => {
    expect(isPrefixedLocale('en')).toBe(false)
    expect(localizePath('/foo/', 'en')).toBe('/foo/')
    expect(localePostPath('foo', 'en')).toBe(postPath('foo'))
    expect(localeTagPath('x', 'en')).toBe(tagPath('x'))
    expect(localeHomePath('en')).toBe('/')
    expect(localeFeedPath('en')).toBe('/rss/')
  })

  it('prefixes every other locale', () => {
    expect(localePostPath('los-colores', 'es')).toBe('/es/los-colores/')
    expect(localeTagPath('materiales', 'es')).toBe('/es/tag/materiales/')
    expect(localeHomePath('de')).toBe('/de/')
    expect(localeFeedPath('id')).toBe('/id/rss/')
  })

  it('reads the locale from the first path segment only', () => {
    expect(localeOfPath('/es/')).toBe('es')
    expect(localeOfPath('/es/foo/')).toBe('es')
    expect(localeOfPath('/es-foo/')).toBe('en')
    expect(localeOfPath('/fr/foo/')).toBe('en')
    expect(localeOfPath('/')).toBe('en')
  })
})

describe('slugs in other languages', () => {
  it('keeps the English rule exactly as it was', () => {
    // Accents are dropped, not transliterated, for English: unchanged.
    expect(slugFromTitle('Café Society')).toBe('caf-society')
    expect(slugFromTitle('Why Ultramarine Cost More Than Gold')).toBe(
      'why-ultramarine-cost-more-than-gold',
    )
  })

  it('transliterates a translated title to lowercase ASCII', () => {
    expect(slugFromTitle('Los colores más caros de la historia', 'es')).toBe(
      'los-colores-mas-caros-de-la-historia',
    )
    expect(slugFromTitle('El pigmento añil', 'es')).toBe('el-pigmento-anil')
    expect(slugFromTitle('Die Grüße der Künstler', 'de')).toBe(
      'die-gruesse-der-kuenstler',
    )
    expect(transliterate('Œuvre', 'es')).toBe('Oeuvre')
  })

  it('reserves every locale code at the root, English included', () => {
    for (const code of LOCALE_CODES) {
      expect(isReservedRootSlug(code)).toBe(true)
      expect(validateRootContentSlug(code)).toContain('language code')
    }
  })

  it('reserves the routes under every prefix for translated slugs', () => {
    for (const segment of ['rss', 'search', 'tag', 'author']) {
      expect(validateLocalizedContentSlug(segment)).not.toBe(true)
    }
    // A root route segment is a fine translated slug: /es/journal/ is free.
    expect(validateLocalizedContentSlug('journal')).toBe(true)
  })
})
