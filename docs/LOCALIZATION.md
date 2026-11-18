# Localization

Translated editions of selected articles — Spanish, Indonesian and German at
launch — alongside the English site, without moving a single English URL.

This document is the reference for how it works, why it is shaped the way it is,
how to run the migration that turned it on, and how to add a language. Read it
before changing a localized field, a public query, the article routes, the
sitemap, or any MCP tool that takes `locale`.

## The rules

These are the constraints everything below is built to hold. Each one has a
test or a guard that fails when it stops being true.

| Rule                                                                                   | Where it is held                                                                                                                                       |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| English URLs never move: `/{slug}/`, no `/en/` prefix, no redirects.                   | `lib/i18n/locales.ts` (`localizePath` returns English paths unchanged); `tests/i18n/locales.test.ts`                                                   |
| Other languages live at `/{locale}/{localized-slug}/`.                                 | `app/(frontend)/[slug]/[localizedSlug]/page.tsx`                                                                                                       |
| No fallback: a field with no translation is empty, never English.                      | `localization.fallback: false` in `payload.config.ts`, and `fallbackLocale: false` on every translated read (`localeArgs` in `lib/content/queries.ts`) |
| A translation is public only when its own status and date say so, and English is live. | `liveIn()` in `lib/content/schedule.ts`; `postsRead` in `access/roles.ts`                                                                              |
| Publishing one language never touches another.                                         | `isolateLocalePublish` in `lib/i18n/publishing.ts`                                                                                                     |
| A Spanish publish does not move English lastmod.                                       | `modifiedAt` (localized), stamped by `stampLocaleDates`                                                                                                |
| An untranslated English page is byte-identical to what it was.                         | `alternates` is `null` below two languages, so nothing renders; client components get no `locale` prop for English (`localeProp`)                      |
| Unknown locale, or no translation: a real 404, no redirect.                            | the `[slug]/…` routes call `notFound()`; `app/(frontend)/[slug]/**/not-found.tsx` answer it in the page's language                                     |
| No language is chosen for the reader.                                                  | nothing reads `Accept-Language` or the client's address; `middleware.ts` sets the page's language from its path only                                   |

## The data model

`payload.config.ts` turns on Payload localization with English as the default
and `fallback: false`. The list of languages is `lib/i18n/locales.ts`.

Localized (`localized: true`):

- **posts**: `title`, `slug`, `excerpt`, `content` (the Lexical body,
  modules included), `legacyHTML`, `metaTitle`, `metaDescription`, and the
  translation state below.
- **tags**: `name`, `slug`, `description`, `metaTitle`, `metaDescription`.
- **authors**: `bio`. Names and slugs are the same in every language.
- **media**: `alt`, `caption`.
- **globals**: header `links` and `cta`, footer `copyright` and `links`, site
  settings `description`.

Not localized, on purpose: `publishedAt` (English's date), `authors`, `tags`,
`featuredImage`, `visibility`, `canonicalURL` (it names where the _English_
piece was first published; a translation is always canonical to itself), the
Ghost import fields, and the Homepage global (language home pages are
generated lists).

**Module text is inside `content`.** FAQ questions and answers, table captions
and cells, key facts — all live in the body's Lexical JSON, so localizing
`content` localizes them with it. The fields inside the blocks are deliberately
_not_ marked `localized`: a translated body is its own document.

### Per-language publishing

`_status` stays one value for the document and keeps meaning _the English
article is published_. Each translation carries its own state, all localized:

| Field                    | Meaning                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `translationStatus`      | `none`, `draft` or `published` — this language's switch.                                                                        |
| `translationPublishedAt` | When it goes out in this language. A date ahead schedules it, as `publishedAt` does for English. Stamped on publish when empty. |
| `modifiedAt`             | When this language's version last changed. Drives lastmod, `dateModified`, `og:modified_time`.                                  |
| `translatedFrom`         | `version` (the English version id) and `englishModifiedAt` it was made from.                                                    |

A translated page is served when `_status = published`, English's
`publishedAt` has arrived, `translationStatus = published`, and
`translationPublishedAt` has arrived (`liveIn`). There is no release job, for
English or translations: scheduled pages appear once cached reads turn over,
within `CONTENT_TTL_SECONDS`.

**Why not Payload's own per-locale status.** Payload 3.90 has
`experimental.localizeStatus`. Its documentation calls it "experimental and
currently in beta… test thoroughly before using in production", it had open
data-loss reports at the time (`#15642`, unnamed groups losing data on
localized publish), and turning it on moves `_status` for every existing post
into a locale table and changes the meaning of every query that reads it —
access rules, `live()`, the MCP publish guard, the dashboard. The fields above
cost four columns and leave every English query as it was. Revisit when the
feature leaves beta.

### The write path, and the four guards

A publish copies the newest version onto the live row, and the newest version
holds every language. Payload's `publishSpecificLocale` merges one language
onto the last _published_ version instead. `lib/i18n/publishing.ts` decides
when that is used and closes the gaps around it:

1. **Isolation.** Every non-draft write in a translated language is isolated to
   it. So is an English write to an article that already has a live translation
   — otherwise a Spanish draft in the newest version would go live with it. An
   English-only article keeps its exact old write path: `publishSpecificLocale`
   also saves a draft "snapshot" version, which would make every English publish
   look unfinished to the admin and to `editorialStatus`.
2. **Fields without a language.** Payload's merge takes non-localized fields from
   the draft whatever language is published (checked in `mergeLocalizedData` at
   3.90.2). A translated publish is pinned to the live row's values for every
   non-localized field, `_status` included.
3. **No translation without English.** A translation can only go live over a
   published English article.
4. **Unpublish stays whole.** "Unpublish" while editing Spanish would take the
   English article down too (status is shared); it is refused there. A
   translation comes down by setting its status to Draft and publishing.

A changed slug on a live translation writes a 301 into Redirects
(`lib/i18n/slug-redirects.ts`), collapsing chains. English slugs are not
redirected automatically — that remains a person's decision.

### Taking a translation down

Measured on a local production build on 17–18 Nov 2026; each takes effect on
the next request, and English is not touched.

- **In the admin**: switch to the language, set **Translation status** to
  Draft, press Publish. The page 404s, the English page loses its hreflang and
  its switcher entry, and the sitemap drops the URL. The text stays as that
  language's draft, ready to publish again.
- **Through the connector**, with an administrator's key: `updatePosts` with
  `locale`, `translationStatus: "draft"` and `_status: "published"`. The same
  write, the same effect.
- **Deleting the text outright** has no button and no tool. It is that
  language's rows in `posts_locales` and `_posts_v_locales` (and in
  `media_locales` for its alt text). A database delete skips Payload's hooks,
  so nothing is purged: pages keep the old state until `CONTENT_TTL_SECONDS`
  runs out. Prefer the Draft takedown, and delete only what it leaves behind.

**A trap found while building this.** Calling the Local API with both `req`
and `locale` writes that locale onto the shared `req`. Inside a hook that runs
during a save in another language, the rest of the save then lands in that
locale. Use the adapter (`payload.db.*`) for cross-language reads inside hooks,
or call without `req`.

## URLs and routes

Next will not have two dynamic segments side by side, so every translated route
nests under the existing root `[slug]`, which then holds the language code:

| URL                  | Route                                                           |
| -------------------- | --------------------------------------------------------------- |
| `/es/`               | `[slug]/page.tsx` — the language's home page, its live articles |
| `/es/{slug}/`        | `[slug]/[localizedSlug]/page.tsx`                               |
| `/es/tag/{slug}/`    | `[slug]/tag/[tag]/page.tsx`                                     |
| `/es/author/{slug}/` | `[slug]/author/[author]/page.tsx`                               |
| `/es/rss/`           | `[slug]/rss/route.ts`                                           |
| `/es/search/`        | `[slug]/search/page.tsx`                                        |

Each answers 404 unless the first segment is a configured language other than
English, and unless that language has something live there. Every locale code,
English included, is a reserved root slug, so no English post or page can take
`/es/`. Translated slugs may not be `rss`, `search`, `tag` or `author`.
`trailingSlash: true` applies as everywhere else.

`<html lang>` and the masthead come from the root layout, which has no route
params; `middleware.ts` sets `x-bea-locale` and `x-bea-path` from the path on
every page request (always _set_, so a client cannot supply its own).

Slugs are lowercase ASCII with hyphens. A translated title is transliterated
when a slug is derived from it (`más` → `mas`, German `ü` → `ue`); English keeps
its old rule exactly.

## What the site outputs

- **Canonical**: every page is canonical to itself, in its own language.
- **hreflang**: on every article, tag archive and author archive published in
  two or more languages — one `<link rel="alternate" hreflang>` per language
  plus `x-default` at the English URL. Built by
  `hreflangFor(alternatesForPath(…))` in `lib/i18n/alternates.ts`, from one
  index (`lib/i18n/locale-index.ts`), so every version carries the same set.
  A page in English only gets none. **Home pages get none**: `/` is the whole
  English archive and `/es/` the pieces translated so far, which are not
  translations of each other — and computing it in the root layout's metadata
  made the homepage's metadata resolve late (see below). The switcher still
  links them.
- **Sitemap**: still one `/sitemap.xml`. English entries are unchanged in URL
  and lastmod; those with translations gain `xhtml:link` alternates identical to
  their page's (home pages none, as on the pages). Translated URLs follow all English ones. A language with nothing
  live contributes nothing.
- **JSON-LD**: `inLanguage`, translated headline and description, and the FAQ
  node built from the translated block — on translated pages and on English
  articles that have a translation. Untranslated English pages are unchanged.
- **Open Graph**: `og:locale` and `og:locale:alternate` under the same rule.
- **Where the metadata lands — a pre-existing caveat.** Next.js 15.5 streams
  metadata: when a page's `generateMetadata` resolves after its shell, the
  title, description, canonical and hreflang are sent in the body and moved
  into `<head>` by React on the client. Measured on 17 Nov 2026, the build
  _before_ this work does it on warm requests for every page tested, for a
  browser and for Googlebot alike. Google renders and sees them in the head;
  a crawler that does not run JavaScript does not. Translations add one cached
  read to an article's metadata, so the same applies to them. Making metadata
  blocking for crawlers (`htmlLimitedBots` in `next.config.ts`) is the fix and
  is a site-wide, crawler-facing change — left for the owner to decide.
- **RSS**: `/rss/` is English as before; `/es/rss/` and so on exist only for
  languages with content.
- **robots.txt**: unchanged; nothing in it blocks `/es/`, `/id/` or `/de/`.
- **The CMS host** needs nothing new: the Caddyfile already sends every
  anonymous page request there to `www` with a 301 and `X-Robots-Tag: noindex`
  on everything it serves.

## The frontend

- **Language switcher**: `components/language-switcher.tsx`, in the masthead and
  at the top of an article. It lists only the languages the page is published
  in, links straight to the equivalent page, and renders nothing otherwise.
- **UI strings**: `lib/i18n/dictionaries/{en,es,id,de}.ts`. English holds
  today's strings verbatim. The others were written for this release and want
  a native speaker's review. The newsletter is sent in English; the translated
  signup copy says so.
- **Dates** are formatted with the page's locale (`dateLocale`).
- **Links in a translated body** are resolved at render time
  (`lib/i18n/links.ts`): an English article with a live translation is pointed
  at it, an untranslated one stays an English link, and a link to a page that
  would 404 renders as text. The stored body is never changed.
- **Lists, search and related articles** read only the page's language.
  Related ranking for a translation compares tag ids (a tag's slug differs by
  language).
- **Preview**: `/api/preview` takes `locale`; the admin's Preview button and Live
  Preview pass the language being edited.
- **Admin**: the post sidebar's Translation panel
  (`components/admin/TranslationPanel.tsx`) says where the language being
  edited stands, and says so when English has been republished since the
  translation was made.

## The MCP connector

See [`MCP_SERVER.md`](MCP_SERVER.md) for the tool table. In short: the article
tools take an optional `locale` (default `en`, behaviour unchanged without it);
`saveTranslation` writes a translation as a draft and never touches English;
`publishArticle` with a `locale` publishes or schedules only that language;
`translationStatus` lists each article's languages; `editorialStatus` takes a
`locale` filter.

## Rolling it out

The schema change is migration `20261117_122510_add_localization`. The generator
drops the moved columns without copying them; this one was edited by hand to
copy every value into its `_locales` table as `en` first (posts and their
versions, tags, authors, media, globals, nav arrays), seed English `modifiedAt`
from `updatedAt` row for row, and backfill the nav arrays' `_locale` before it
becomes `NOT NULL`. `down` copies English back, and refuses while translations
exist unless `DOWN_DISCARDS_TRANSLATIONS=1`.

`pnpm i18n:migration-counts` reads a database in either shape and prints row
counts and non-empty value counts for every moved column; `--out` saves a
reading and `--compare` checks one against another and exits 1 on any loss.

### Rehearse on a copy of production first

On the VPS, following [`BACKUP_AND_RESTORE.md`](BACKUP_AND_RESTORE.md) §2 —
never against production:

```bash
# 1. A scratch database holding the latest backup.
docker compose exec postgres createdb -U payload beyond_every_art_i18n
docker compose run --rm --entrypoint tsx backup \
  scripts/restore-database.ts --latest --yes \
  --target postgresql://payload:<password>@postgres:5432/beyond_every_art_i18n

# 2. Counts before, migration, counts after — all against the scratch copy.
SCRATCH=postgresql://payload:<password>@postgres:5432/beyond_every_art_i18n
docker compose run --rm -e DATABASE_URI=$SCRATCH migrate \
  pnpm i18n:migration-counts --out /tmp/before.json
docker compose run --rm -e DATABASE_URI=$SCRATCH migrate pnpm migrate:db
docker compose run --rm -e DATABASE_URI=$SCRATCH migrate \
  pnpm i18n:migration-counts --compare /tmp/before.json
```

`/tmp/before.json` lives in the throwaway container; keep the steps in one
container (`docker compose run --rm -e … migrate sh -c '…; …; …'`) or mount a
directory if you run them separately. The last command must print `OK`.

### Then production, in this order

1. No English post or page may hold a locale code as its slug, and no redirect
   may start with `/en/`, `/es/`, `/id/` or `/de/`. Posts were checked through
   the connector on 18 Nov 2026 (none, live or draft); check pages and
   Redirects in the admin.
2. `pnpm i18n:migration-counts --out` against production, saved off the
   container.
3. `pnpm backup:db`, and confirm it landed off-server.
4. The normal deploy: `docker compose run --rm migrate` applies the three
   migrations (`add_localization`, `add_translation_tool_capabilities`,
   `add_drafted_at`) before the containers are replaced.
5. `pnpm i18n:migration-counts --compare` against the reading from step 2. It
   must print `OK`; anything else, restore the step 3 backup.
6. Spot-check that English is unchanged: a few articles, `/sitemap.xml` (no new
   URLs, no `xhtml:link`), `/rss/`, and `/es/` answering 404.
7. Existing MCP keys get `saveTranslation` and `translationStatus` from the
   capabilities they already had; review them under API keys if that is not
   wanted.

## Adding a language

1. Add one entry to `LOCALES` in `lib/i18n/locales.ts` — code (ISO 639-1, no
   region), its name in itself, `ogLocale`, `dateLocale`, and `transliterate`
   if the language spells out accented letters.
2. Add `lib/i18n/dictionaries/{code}.ts` and register it in
   `dictionaries/index.ts`. TypeScript refuses to compile until both exist and
   the dictionary has every string.
3. `pnpm migrate:db:create add_locale_{code}` — Postgres keeps the locale codes
   in enums, so the generator writes `ALTER TYPE … ADD VALUE`; nothing to edit
   by hand. Commit it with the rest.

The code is reserved as a root slug automatically. Before deploying, check no
English post or page already uses it (`findPosts` with `where: { slug: { equals:
'{code}' } }`, and the same for pages in the admin).
