# llms.txt and AI visibility

A plan for publishing `/llms.txt` on `www.beyondeveryart.com`, and for the three
things that decide how visible the site is to AI assistants more than that file
does. **None of it is built.** The file is a new crawler-facing URL, so per
[`AGENTS.md`](../AGENTS.md) it waits for the owner's go-ahead; the decisions
that need one are collected at the end.

Related: [`SEO_AND_REDIRECTS.md`](SEO_AND_REDIRECTS.md) (the routes this sits
beside, and the dotted-path trap), [`EDGE_PROTECTION.md`](EDGE_PROTECTION.md)
(the Cloudflare zone §1 is about), [`ADVERTISING.md`](ADVERTISING.md) §1 (how
`/ads.txt` is served, and why this file is served differently),
[`ANALYTICS.md`](ANALYTICS.md).

## Verdict

**Build it — it is half a day — but do not build it for traffic.** On the
evidence available in September 2026 it will not measurably change how often
AI assistants cite or link to this site:

- **Google has said no, on the record.** In July 2025 Google said it does not
  use `llms.txt` and has no plans to. AI Overviews and AI Mode are built from
  Googlebot's crawl and the ordinary index, so for Google the sitemap, the
  JSON-LD and the pages themselves are what count — and those shipped with the
  migration.
- **The large AI crawlers rarely request it.** Third-party log studies report
  that GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot and their peers
  overwhelmingly skip `/llms.txt` and fetch HTML directly. No major provider has
  committed to reading it.
- **What does read it is agents a person points at the site** — a research or
  coding agent, a chat assistant given the URL, a tool that looks for the file
  before it crawls. Useful to them, and cheap to serve, but a small audience.

So the file is worth having as an accurate, self-maintaining table of contents
for those agents. The things that actually decide AI visibility for this site,
in order of how much they could be costing it today:

1. **Whether Cloudflare lets the citing crawlers through** (§1). This is the one
   that could be at zero right now without anybody knowing.
2. **Bing** (§2), which is not set up at all.
3. **Measuring** (§7), so any of this can be judged afterwards.

`llms.txt` itself is §3–§6.

## 1. First: what Cloudflare lets through

`robots.txt` is a request; since the zone went behind the proxy on 18 Sep 2026,
the edge decides which AI crawlers actually receive a page. That decision is a
dashboard setting, and nothing in this repository records it.

What is known, checked on 26 Sep 2026:

- **`robots.txt` allows everything.** `User-Agent: *`, `Allow: /`, two
  `Disallow`s, the sitemap. There is no Cloudflare-managed block prepended to
  it, so Cloudflare's managed `robots.txt` is off.
- **Every article carries ads.** A live article page loads the AdSense script
  with five units. Any edge rule scoped to "pages with ads" therefore applies to
  every article on the site.
- **Cloudflare's defaults for new zones have moved towards blocking.** A
  third-party guide reports that zones created from 15 Sep 2026 default to
  blocking _training_ and _agent_ crawlers on pages Cloudflare detects as
  carrying ads, while leaving _search_ crawlers allowed. That is not confirmed
  from Cloudflare's own documentation, and this zone's creation date is not
  recorded here — so the only way to know what it has is to look.
- **Probing from outside proves nothing.** Requests sent with a `GPTBot` or
  `ClaudeBot` user agent get 200, but Cloudflare classifies verified crawlers by
  signature and source network, not by a header anyone can send.

**Action — owner, dashboard, five minutes.** Open **AI Crawl Control →
Crawlers**, and record each crawler's action here. What this plan recommends:

| Crawler            | Operator     | What it fetches for                    | Recommend           |
| ------------------ | ------------ | -------------------------------------- | ------------------- |
| `Googlebot`        | Google       | Search, AI Overviews, AI Mode          | Allow — never block |
| `OAI-SearchBot`    | OpenAI       | ChatGPT search's index                 | Allow               |
| `ChatGPT-User`     | OpenAI       | a page a person asked ChatGPT about    | Allow               |
| `Claude-SearchBot` | Anthropic    | Claude's search index                  | Allow               |
| `Claude-User`      | Anthropic    | a page a person asked Claude about     | Allow               |
| `PerplexityBot`    | Perplexity   | Perplexity's search index              | Allow               |
| `Perplexity-User`  | Perplexity   | a page a person asked Perplexity about | Allow               |
| `GPTBot`           | OpenAI       | model training                         | Owner's decision    |
| `ClaudeBot`        | Anthropic    | model training                         | Owner's decision    |
| `CCBot`            | Common Crawl | a public corpus most models train on   | Owner's decision    |

The search and user-initiated rows are the ones that produce citations with
links, so they are the ones that matter for traffic. If any of them is blocked
on ad-bearing pages, that — not the absence of `llms.txt` — is why the site is
missing from AI answers.

The training rows are a genuine decision rather than a setting. Allowing them
sends no traffic directly; blocking them does not remove the site from AI
search as long as the rows above are allowed. `Google-Extended` and
`Applebot-Extended` belong to the same decision but are not crawlers — they are
`robots.txt` tokens that Googlebot and Applebot honour — so they can only be
expressed in `robots.txt`, not at the edge. Whatever is decided, write it into
`app/robots.ts` as well as the dashboard, so the policy is reviewed and tested
in the repository rather than living only in a console. That is a change to a
file every crawler caches, and it waits for the owner.

## 2. Bing

Neither this repository nor the cutover notes mention Bing Webmaster Tools;
[`DEPLOYMENT_STATUS.md`](DEPLOYMENT_STATUS.md) lists Search Console only. Bing's
index is what Copilot and DuckDuckGo answer from, and it has been one of the
sources ChatGPT search draws on — so a site that only Google has been told about
is under-represented in exactly the assistants this plan is about.

**Action — owner, ten minutes.** Sign in to Bing Webmaster Tools, import the
site from Search Console (which verifies it without a new meta tag or DNS
record), and submit `https://www.beyondeveryart.com/sitemap.xml`.

**IndexNow later, not now.** It tells Bing about a URL the moment it is
published, but it needs a key file served at a dotted root path — the same class
of path that `/ads.txt` had to be moved to Caddy for — and a publish hook that
calls a third party. Worth it only if Bing's crawl turns out to lag publishing
noticeably, which §7 will show.

## 3. What `/llms.txt` says

The format, from [llmstxt.org](https://llmstxt.org/): an H1 with the site's name
(the only required part), a blockquote summary, optional free text, then H2
sections that are lists of links, each optionally followed by a colon and a
note. A section headed `Optional`
holds what an agent can skip when it is short of context.

For this site, in shape (the article lines are placeholders, not content):

```markdown
# Beyond Every Art

> {site-settings description}

{Two or three sentences, below.}

## Palette

- [Article title](https://www.beyondeveryart.com/article-slug/): Its meta description.
- [Another title](https://www.beyondeveryart.com/another-slug/) (Subscribers): Its excerpt.

## Exhibitions

- …

## About

- [About](https://www.beyondeveryart.com/about/): …
- [Author name](https://www.beyondeveryart.com/author/author-slug/)
- [RSS feed](https://www.beyondeveryart.com/rss/)
- [Sitemap](https://www.beyondeveryart.com/sitemap.xml)

## Optional

- [Apps](https://www.beyondeveryart.com/apps/): …
- [Tag archive name](https://www.beyondeveryart.com/tag/tag-slug/)
```

A draft of the free text, from [`PRODUCT.md`](../PRODUCT.md), for the owner to
rewrite:

> An independent publication about art, colour and materials — the chemistry of
> pigments, how techniques behave, what exhibitions show. Articles are long-form
> and written for practising artists and curious readers. Articles marked
> (Members) or (Subscribers) show a teaser to readers who are not signed in.

Each rule below exists to keep the file from saying anything the rest of the
site does not.

- **The same selection as the sitemap.** Posts through `live()`, published
  pages, `noindex` dropped, tags through `listableTags`. A URL in `llms.txt`
  that the sitemap omits means one of the two is wrong, so the read in
  `app/sitemap.ts` becomes one shared function both call, and a test checks
  that every article URL in the file is a sitemap URL.
- **The page's own canonical URL.** `absoluteUrl(post.canonicalURL ||
postPath(slug))`, the expression the post page already uses for its canonical
  tag. Today one post sets `canonicalURL` and it is the post's own path, so this
  changes nothing now; it is there so a piece first published elsewhere is
  listed at its original.
- **Grouped by primary subject.** Each post goes under its first subject tag
  (`isSubjectTag` in `lib/content/topics.ts`, so `featured` never becomes a
  heading), largest group first, newest first within it; posts with no subject
  go under "More articles". The grouping is what makes this a table of contents
  rather than the sitemap in Markdown. It also publishes the tag list as it
  stands, which today includes both "Science of Art Materials" and a tag named
  `materials-science` after its own slug — so the pending tag clean-up
  (`pnpm tags:apply`, [`SEO_AND_REDIRECTS.md`](SEO_AND_REDIRECTS.md)) should
  land first.
- **Notes from `metaDescription`, then `excerpt`,** collapsed to one line and
  cut near 200 characters on a word boundary. At least five published posts
  have neither; they are listed with no note rather than an invented one.
  Filling those in helps search snippets as much as this file.
- **Gated posts are listed, and marked** with `visibilityLabel` from
  `lib/membership.ts`. Same reasoning as the RSS feed: a title, a link and one
  line is what a signed-out reader already sees. One post is gated today.
- **Tags carry no notes,** because all ten have an empty `description`. If the
  owner writes descriptions they appear here with no code change.
- **Valid Markdown.** Brackets in titles escaped, newlines stripped, a final
  newline — the lesson `ads.txt` taught about unterminated last lines.

With 113 published posts the file comes to roughly 25–35 KB.

## 4. How it is served

- **A route handler at `app/llms.txt/route.ts`,** `force-dynamic`, reading
  through `cachedRead` with the posts, pages, tags, authors, apps and globals
  tags — the pattern `app/sitemap.ts` and `app/rss/route.ts` already use, so a
  publish in the admin updates it. The renderer is a pure function in
  `lib/seo/llms-txt.ts`, unit tested, like `lib/seo/rss.ts`.
- **Not Caddy, and not `public/`.** `/ads.txt` is served by Caddy because it is
  a fixed third-party record committed to the repository. This file is generated
  from content, and a static copy would be wrong after the next publish.
  `public/` is skipped by `output: 'standalone'` in any case.
- **The trailing slash is not a problem here, but prove it.** Next's built-in
  `trailingSlash` redirects (`load-custom-routes.js` in the installed `next`)
  treat a final path segment with an extension as a file: `/llms.txt/` is
  redirected to `/llms.txt`, and `/llms.txt` is served as it is. So the
  unslashed address the convention names is the one that answers. That is a
  reading of the framework's source; the end-to-end probe in §6 is what settles
  it, because this is exactly the kind of path that has surprised this project
  before.
- **The middleware never sees it.** Its matcher skips any path containing a
  dot, so there is no redirect lookup — fine — and no staging Basic Auth gate.
  On staging the file would be public, so the route checks `isNoindex()` the
  way `app/robots.ts` does and answers 404 there.
- **Reserve the segment.** Add `llms.txt` to `RESERVED_ROOT_SLUGS` in
  `lib/seo/reserved-slugs.ts`. `tests/docs/drift.test.ts` fails until it is.
- **Headers.** `Content-Type: text/plain; charset=utf-8`.
  `Cache-Control: public, max-age=3600, s-maxage=3600`: Cloudflare caches
  `.txt` at the edge (`/robots.txt` comes back with `cf-cache-status`), and the
  purge hooks drop Next's data cache, not Cloudflare's, so `s-maxage` is the
  bound on how stale the file can be after a publish. `X-Robots-Tag: noindex`
  keeps the file itself out of search results without stopping any agent from
  fetching it.
- **Degrade, never fail.** If the database is unavailable, serve the H1, the
  blockquote and the About links — the equivalent of the sitemap's
  homepage-only fallback — rather than a 500.
- When it ships, add it to the table at the top of
  [`SEO_AND_REDIRECTS.md`](SEO_AND_REDIRECTS.md).

## 5. What not to build

- **`llms-full.txt`,** every article's full text in one file. No — and
  reversing that is the owner's call. The site earns from readers on the page,
  five ad units an article, and a single file holding the whole archive is the
  easiest possible thing to answer from without sending anyone there. It would
  also have to apply the paywall cut correctly to gated bodies in a file nobody
  reviews, and almost every body is migrated `legacyHTML` with no HTML-to-Markdown
  converter in this codebase (`htmlToPlainText` in `lib/content/plain-text.ts`
  drops the headings). Nothing suggests the major crawlers would request it.
- **Per-article `.md` twins** (`/slug.md`, which the specification suggests).
  No, for the same full-text reason, and because each is a second URL per
  article to keep out of the index; `/slug.md` would also land in the `[slug]`
  route and need routing of its own.
- **A pointer to `llms.txt` in `robots.txt`.** Nothing reads one, and
  `MetadataRoute.Robots` cannot emit a comment.
- **A `<link>` in every page's head.** There is no standard relation for it.

## 6. Tests

- **`tests/seo/llms-txt.test.ts`** against the pure renderer: the first line is
  an H1 and the second block a blockquote; every link is absolute on the site
  origin and slashed (the sitemap link aside); `noindex` and scheduled posts are
  absent; `featured` is never a heading; a title with brackets is escaped; gated
  posts are marked; the output ends with a newline; the order is deterministic;
  and every article URL appears in `buildSitemapEntries`' output.
- **The reserved-slug check** in `tests/docs/drift.test.ts`, which needs no
  change — it fails on its own until the segment is reserved.
- **`e2e/seo-and-health.spec.ts`:** `GET /llms.txt` answers 200 with
  `text/plain`, no redirect, and a body starting `# `; `GET /llms.txt/`
  redirects to `/llms.txt`.
- **After deploy,** from outside:
  `curl -sS https://www.beyondeveryart.com/llms.txt | head -20`. Read the body,
  not the status code.

## 7. Measuring

Take the baseline before anything in §1–§4 ships, or no later change can be
attributed to anything.

- **GA4:** a custom channel group, "AI assistants", matching session source
  against `chatgpt\.com|chat\.openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com`.
  Record the last 90 days. Assistant apps often send no referrer, so this is a
  floor, not a count.
- **Cloudflare AI Crawl Control:** requests per crawler per week, recorded now.
- **`/llms.txt` itself:** Cloudflare's analytics filtered to the path, by user
  agent.
- **Review at 30 and 90 days.** The expectation, written down now so it can be
  checked: few fetches of `/llms.txt`, mostly not from the major crawlers; any
  change in AI referrals owed to §1 or §2 rather than to the file.

## 8. Order of work

| Step | Who   | What                                                                                                                                                     | Size       |
| ---- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1    | Owner | §1: read AI Crawl Control, record it here                                                                                                                | 5 minutes  |
| 2    | Owner | §1: the training-crawler decision                                                                                                                        | a decision |
| 3    | Owner | §2: Bing Webmaster Tools and the sitemap                                                                                                                 | 10 minutes |
| 4    | Owner | §7: the GA4 channel group and the baseline                                                                                                               | 15 minutes |
| 5    | Owner | §3: the free text; optionally tag and missing meta descriptions                                                                                          | —          |
| 6    | —     | the tag clean-up already in hand lands                                                                                                                   | —          |
| 7    | Agent | one pull request, one commit each: reserve the slug and share the sitemap's selection; the renderer and its tests; the route and the e2e probe; the docs | half a day |
| 8    | Agent | the post-deploy probe, recorded in `DEPLOYMENT_STATUS.md`                                                                                                | 5 minutes  |
| 9    | Owner | §7: the 30- and 90-day reviews                                                                                                                           | —          |

Steps 1–4 do not wait on any code, and each of them matters more than it does.

## Decisions for the owner

1. **Go-ahead for `/llms.txt`** — a new URL that crawlers will cache.
2. **Training crawlers** (§1): allow or block, and whether `robots.ts` says so
   as well as Cloudflare.
3. **The free text** (§3), and whether it should state a reuse or attribution
   policy.
4. **`llms-full.txt`** (§5): recorded here as no.
