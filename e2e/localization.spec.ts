import { expect, test } from '@playwright/test'

import { fixtures } from './fixtures'

// Translated editions, over the wire, on a site where no translation is live.
//
// That is the state production is in the day this ships and stays in for
// every language until its first translation is published — so it is the state
// worth pinning. `docs/LOCALIZATION.md` promises that a language with nothing
// live has no pages at all: every URL under its prefix is a real 404 (never a
// redirect to English), and English is served exactly as before, with no
// hreflang, no switcher and nothing new in the sitemap. The unit tests cover
// the pieces; this covers the routes, which is where a page that forgot to ask
// "does this language have anything?" would show up. The translated search
// page was one, and answered 200 to a language with no articles.
//
// No spec in this suite creates a translation, so the assertions hold for the
// whole run. A test that adds one must clean it up or move these elsewhere.

const PREFIXES = ['es', 'id', 'de'] as const

for (const locale of PREFIXES) {
  test(`every /${locale}/ URL is a real 404 while ${locale} has nothing live`, async ({
    request,
  }) => {
    const paths = [
      `/${locale}/`,
      `/${locale}/?page=2`,
      `/${locale}/rss/`,
      `/${locale}/search/`,
      `/${locale}/search/?q=white`,
      `/${locale}/${fixtures.publicPost.slug}/`,
      `/${locale}/tag/${fixtures.tag.slug}/`,
      `/${locale}/author/${fixtures.author.slug}/`,
    ]
    for (const path of paths) {
      const response = await request.get(path, { maxRedirects: 0 })
      expect(response.status(), path).toBe(404)
    }
  })
}

test('English has no /en/ prefix and is never redirected by language', async ({
  request,
}) => {
  for (const path of ['/en/', `/en/${fixtures.publicPost.slug}/`]) {
    const response = await request.get(path, { maxRedirects: 0 })
    expect(response.status(), path).toBe(404)
  }

  // A Spanish browser asking for an English URL gets the English page.
  const article = await request.get(`/${fixtures.publicPost.slug}/`, {
    headers: { 'Accept-Language': 'es-ES,es;q=0.9' },
    maxRedirects: 0,
  })
  expect(article.status()).toBe(200)
  const html = await article.text()
  expect(html).toContain('<html lang="en"')
  expect(html).toContain(fixtures.publicPost.title)
})

test('an untranslated English page names no other language', async ({
  request,
}) => {
  for (const path of [
    '/',
    `/${fixtures.publicPost.slug}/`,
    `/tag/${fixtures.tag.slug}/`,
    `/author/${fixtures.author.slug}/`,
  ]) {
    const html = await (await request.get(path)).text()
    expect(html, path).toContain('<html lang="en"')
    expect(html, path).not.toMatch(/hrefLang=/i)
    expect(html, path).not.toContain('og:locale')
    expect(html, path).not.toContain('lang-switch')
    expect(html, path).not.toContain('inLanguage')
  }

  const sitemap = await (await request.get('/sitemap.xml')).text()
  expect(sitemap).not.toMatch(/<loc>[^<]*\/(es|id|de)\//)
  expect(sitemap).not.toContain('xhtml:link')
})
