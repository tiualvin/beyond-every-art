# Stock imagery, and the Unsplash API

## Summary

- **Status:** evaluated, and planned — see
  [Implementation plan](#implementation-plan). No Unsplash dependency added and
  no key issued — the API itself is not built and the decisions below gate it.
  What _is_ built is the attribution the guidelines require, because it repays
  the credits already on the site regardless: see
  [Finding 2](#finding-2-attribution-is-required-by-the-api-and-mediacredit-could-not-carry-it--built).
  The rest records what adopting the API would cost and what it would oblige,
  because two of the obligations are not obvious and one of them is a decision
  for the repository owner rather than for whoever writes the code.
- **The question is narrower than it looks.** This publication already runs on
  Unsplash photographs — every feature image it has, 110 credits and 102
  distinct photographers, all of the form `Photo by <name> / Unsplash`. They
  were picked by hand in Ghost's editor, through an integration the cutover
  removed. So the proposal is not "start using stock photography"; it is
  "replace the picker that used to do this", and the alternative on the table
  is not "no stock photography" but "an editor with a browser tab open".
- **Recommendation:** yes, but bind it to a narrow job, and settle
  [Finding 1](#finding-1-the-hotlinking-guideline-runs-against-the-media-pipeline)
  and [Finding 2](#finding-2-attribution-is-required-by-the-api-and-mediacredit-could-not-carry-it--built)
  before writing any of it. Finding 2 is a schema change and therefore a
  migration; Finding 1 is not a technical question at all.
- **The sharpest constraint is editorial, not technical** —
  [Finding 5](#finding-5-the-editorial-risk-is-the-one-that-matters). A
  publication about specific works has a particular way to be wrong with a
  stock photograph, and it is the same failure the `aiGenerated` default in
  [`docs/MCP_SERVER.md`](MCP_SERVER.md) exists to prevent.
- **For articles about actual works, Unsplash is the wrong library.** Museum
  open-access APIs return the works themselves with rights metadata attached —
  see [Better sources for this publication](#better-sources-for-this-publication).
  That is a larger recommendation than the one that was asked for, and it is
  the one most likely to matter.

## What changes the question

[`lib/migration/feature-image-credits.ts`](../lib/migration/feature-image-credits.ts)
was written to recover something the import had passed over, and in doing so it
inventoried where this publication's pictures come from:

> On this publication the caption is a credit every time: 110 of them, every one
> of the form `Photo by <name> / Unsplash`.

Ghost shipped an Unsplash picker in its editor. Somebody chose a photograph per
article, Ghost stored the bytes and wrote a linked credit into
`feature_image_caption`, and that is the whole of the workflow that has produced
every feature image on the site. The cutover kept the images and the credits and
deleted the picker.

Two consequences follow, and they pull in opposite directions.

**The workflow is load-bearing**, so the gap is real. An editor drafting an
article through the MCP endpoint today has `uploadMediaFromUrl` and no way to
find a URL to hand it. Whatever replaces the picker, something has to.

**The migration already dropped half of what Unsplash asks for.** The Ghost
captions carried a link to the photographer's Unsplash profile; `media.credit`
is a plain text field and React escapes what it renders, so the import stripped
the anchor and kept the name. That was the right call at the time and it is
recorded as such. It also means the site currently displays 110 attributions
that name a photographer and link to nobody — which was Ghost's obligation as
the API client, not ours. Becoming the API client is what would make it ours.

## What it would cost to build

Less than the findings below suggest, because the hard part already exists.
[`lib/security/outbound-fetch.ts`](../lib/security/outbound-fetch.ts) fetches an
address chosen by a caller without the server-side request forgery that usually
implies: https only, every resolved address checked rather than the hostname,
the checked address pinned to the one connected to, redirects followed by hand
and re-validated. `uploadMediaFromUrl` in [`lib/mcp/tools.ts`](../lib/mcp/tools.ts)
already ends at it, vets the bytes by their leading bytes rather than a claimed
type, and takes `alt`, `caption`, `credit` and `aiGenerated` on the way in.

So the missing piece is search: one tool that takes a query, calls
`GET https://api.unsplash.com/search/photos`, and returns a handful of
candidates with their URLs, their photographers, and their attribution links.
The upload path is already there and needs nothing.

## Findings

### Finding 1: the hotlinking guideline runs against the media pipeline

The API documentation is explicit:

> we require the image URLs returned by the API to be directly used or embedded
> in your applications (generally referred to as hotlinking)

and the guidelines repeat it: "All API uses must use the hotlinked image URLs
returned by the API under the `photo.urls` properties." The stated reason is
view tracking for the photographer, which is a fair thing to want.

This repository stores bytes. Media documents hold a file, Payload generates the
size variants [`collections/Media.ts`](../collections/Media.ts) declares, the
backups cover them, and `img-src` in [`lib/security/csp.ts`](../lib/security/csp.ts)
plus the remote patterns in [`lib/security/images.ts`](../lib/security/images.ts)
both name only the origins this deployment serves from. Hotlinking
`images.unsplash.com` means adding it to both, and it means every article page
depends on a third party's CDN at render time.

There is one data point in this repository about how that goes, and it is not
ambiguous. Media id 4 is the site's only broken image. It is, per
[`DEPLOYMENT_STATUS.md`](DEPLOYMENT_STATUS.md), "an Unsplash URL that was linked
rather than stored" — the single feature image Ghost hotlinked instead of
downloading, and therefore the single one that did not survive being moved.

So the honest position is: this project intends to keep storing bytes, for
reasons that are good and that it has already paid to learn, and storing bytes
is not what the guideline asks for. Ghost stored them too, for years, under the
same guideline. That does not make it compliant; it makes it common.

**This is not a call to make in code.** [`AGENTS.md`](../AGENTS.md) says to stop
and ask when a choice touches a third party's records, and a vendor's API terms
are as close to that as makes no difference. The options, stated plainly:

1. **Store, attribute properly, and accept the divergence.** What Ghost did.
   Cheapest, keeps every property of the current pipeline, and knowingly does
   not follow one technical guideline of a service whose licence separately
   permits copying and commercial use.
2. **Hotlink and comply.** Costs an origin in the CSP, a remote pattern, a
   render-time dependency on someone else's CDN, and the loss of the size
   variants and the backup coverage.
3. **Store, but call the download endpoint** ([Finding 3](#finding-3-the-download-trigger-is-cheap-and-easy-to-forget)),
   which is what the view-tracking rationale is actually about, and attribute
   with a working link. This gives the photographer the count and the referral
   the guideline exists to produce, by the route the pipeline can support.

Option 3 is the recommendation. It is not the letter of the guideline, and it
should be adopted as a deliberate position rather than as an oversight.

### Finding 2: attribution is required by the API, and `media.credit` could not carry it — built

Worth separating two documents that are easy to conflate:

- the [Unsplash License](https://unsplash.com/license) governs the photographs.
  Attribution is **not required** — "No permission needed (though attribution is
  appreciated!)" — and commercial use is permitted. This is what the existing
  110 images are used under.
- the [API Guidelines](https://help.unsplash.com/en/articles/2511245-unsplash-api-guidelines)
  govern the API, and they **do** require attribution: credit Unsplash and the
  photographer, "contain a link back to their Unsplash profile", with
  `?utm_source=your_app_name&utm_medium=referral` on every referral link.

Using the API is what turns an appreciated courtesy into a condition of access.
And `media.credit` is `{ name: 'credit', type: 'text' }` — one plain string,
rendered by `FeaturedFigure` in
[`app/(frontend)/components/article.tsx`](<../app/(frontend)/components/article.tsx>)
inside a span. It cannot hold a link. That is not an oversight either; the
migration chose plain text deliberately, because the alternative was shipping
escaped markup to readers.

**This is built, ahead of any decision about the API**, because it repays the
110 credits already on the site whether or not the API is ever adopted.
`media.creditURL` sits alongside `credit`; `FeaturedFigure` renders the credit
as a link when it is set and as plain text when it is not, so nothing changes
for a record that has only a name.

[`lib/content/attribution.ts`](../lib/content/attribution.ts) is the whole of
the policy, and it does two things in one function on purpose. It refuses
anything that is not a plain https address — React hands an `href` to the DOM
verbatim, `javascript:` included, with a development-only warning and nothing
in production — and it appends `utm_source` and `utm_medium=referral` for
Unsplash and for nowhere else, because on a museum's collection page those
parameters are noise somebody did not ask for. Folding the two together means
`attributionHref` returns null rather than a best-effort string, so there is no
argument a component can pass that yields a usable `href` and skips the check.
The parameters are added at render rather than stored, so the field holds the
photographer's actual profile URL and one place decides what this site calls
itself.

The links themselves came back out of the Ghost export, where they had been all
along: [`lib/migration/feature-image-credits.ts`](../lib/migration/feature-image-credits.ts)
kept the photographer's name and dropped the href, on the grounds that its
`utm_source=ghost` parameters named a site this publication no longer is. That
was right about the parameters and wrong about the link — the profile URL is
the one part of an attribution that cannot be reconstructed from anything else.
`captionToCreditURL` now recovers it, strips only the `utm_*` keys, and
`pnpm repair:content` writes it. Note the ordering that matters there: the href
is read out of the markup before entities are decoded, because Ghost writes the
separators as `&amp;` and a URL with a literal `&amp;` between its parameters
is a different URL.

This is also the prerequisite for production rate limits
([Finding 4](#finding-4-rate-limits-are-not-the-constraint)), which Unsplash
grants on review of exactly this.

### Finding 3: the download trigger is cheap, and easy to forget

Every time an application does something download-shaped with a photo — saving
it into a post is the documentation's own example — it must `GET` the URL in
`photo.links.download_location`. It is "purely an event endpoint used to
increment the number of downloads a photo has"; it returns a URL and is not how
the image is fetched.

Three rules for wiring it, all of which are easy to get backwards:

- fire it when a photo is **chosen**, not when it is searched. Firing per search
  result inflates every photographer's count and is the abuse the guideline's
  "non-automated, high-quality" clause is about.
- it takes the same `Client-ID` authorization as the rest of the API, so it
  belongs on the server, next to the search call.
- its response URL is not the one to download or embed. `photo.urls.*` is.

### Finding 4: rate limits are not the constraint

Fifty requests an hour in demo mode; a thousand an hour once an application is
approved for production. Only JSON calls to `api.unsplash.com` count — image
fetches do not.

This publication publishes on the order of a few articles a week. One search
plus one download trigger per chosen photo is single digits per article, so even
demo mode is an order of magnitude more than the editorial workflow needs. The
reason to apply for production is not headroom; it is that the review is what
confirms the attribution in Finding 2 is actually correct. Which means Finding 2
comes first regardless.

### Finding 5: the editorial risk is the one that matters

[`docs/MCP_SERVER.md`](MCP_SERVER.md) already states this publication's position
on pictures, in the course of explaining why `uploadMedia` marks uploads
`aiGenerated` unless told otherwise:

> This publication writes about specific works and materials, so which pictures
> are synthetic has to stay an answerable question … an image wrongly marked as
> generated is a nuisance, one wrongly marked as a photograph is a false claim
> about a work of art.

A stock photograph carries a related failure by a different route. It is a real
photograph, so nothing about it is false — until it sits at the top of an
article about a particular painting, where a reader will take it as a picture of
that painting, or of that exhibition, or of that studio. Nothing in the markup
says otherwise; the credit line says who took it, not that its subject is
unrelated to the text.

Hand-picking in Ghost bounded this, because a person saw the article and the
photograph at the same moment. An agent searching an API on the strength of a
headline does not, and will confidently return something plausible. The
containment is a rule about where stock is allowed, not a better search query:

- **Fine:** atmosphere, texture, abstraction, a header for an essay that is
  about an idea rather than an object.
- **Not fine:** anything a reader could reasonably read as documentation of the
  work, place, or person the article names.

The `aiGenerated` precedent suggests the shape of the mitigation: record where
the image came from, in a field that can be filtered, so "which pictures are
stock?" stays as answerable as "which pictures are generated?". `Media` already
carries `ghostURL` as provenance for migrated files; a `sourceURL` is the same
idea for this path.

### Finding 6: the access key must never reach the agent

"Your application's Access Key and Secret Key must remain confidential." An MCP
tool is the right place for this by construction: the tool runs inside the
Payload server, the key is read from the server's environment, and the agent
sees search results rather than a credential. The same is not true of any design
where the model is handed a key and told to call the API itself, and that design
should not be built.

Note the consequence for configuration: the key belongs in `.env` on the VPS.
Adding it to [`.env.example`](../.env.example) before anything reads it would
fail `tests/docs/drift.test.ts`, which checks in both directions that documented
variables are read and read variables are documented. That is the test working;
the variable arrives with the code that uses it.

### Finding 7: one vendor, one library

Unsplash has been owned by Getty Images since 2021, so this is a dependency on
one company's commercial direction rather than on a community project. Press
reporting in March 2026 described Getty as having issued a going-concern
warning; that is worth confirming from a primary source before it drives any
decision, and it is not a reason to avoid the API. It is a reason to keep the
adoption shallow enough to reverse: bytes stored locally, provenance in the
Media record, and the search call behind one module that a different library
could replace without touching the tool that calls it.

## Better sources for this publication

Unsplash is a general photography library. For an art publication, three kinds
of source are a better fit for the images that matter most, and none of them is
a stock library:

- **Museum open-access APIs.** The Metropolitan Museum of Art, the Art Institute
  of Chicago, the Rijksmuseum and the Cleveland Museum of Art all publish
  collection APIs with public-domain images and rights metadata on each record.
  These return _the work itself_, catalogued, which is what an article about a
  work actually wants and what no stock library can provide.
- **Europeana and Wikimedia Commons**, for breadth across European collections,
  with per-item licences that have to be read per item rather than assumed.
- **Unsplash and its peers**, for the atmosphere-and-texture case in
  [Finding 5](#finding-5-the-editorial-risk-is-the-one-that-matters).

The per-item licence reading is the real work in the first two, and it is not
work an agent should be trusted to do silently — a public-domain photograph of a
public-domain painting is not the same as a museum's own photograph of it, and
the distinction is jurisdictional. That is an argument for surfacing the rights
field to an editor, not for avoiding the source.

This is deliberately out of scope for the immediate question and is recorded
here because the immediate question is the smaller one.

## Recommended shape, if it is built

1. ~~**`creditURL` on `Media`, and a linked credit in `FeaturedFigure`.**~~
   Built — see [Finding 2](#finding-2-attribution-is-required-by-the-api-and-mediacredit-could-not-carry-it--built).
   Run `pnpm repair:content --input <ghost-content.json>` to write the recovered
   links; it compares both the credit text and the link, so a database where the
   first backfill already ran is not reported as needing nothing.
2. **One module** — `lib/stock/unsplash.ts` — holding the search call, the
   download trigger, and the attribution builder that appends the UTM
   parameters. Nothing else imports the vendor.
3. **One MCP tool**, `findStockPhoto`, returning at most a handful of
   candidates: id, description, `urls.regular`, photographer name, profile URL,
   and `links.download_location`. Bodies are already elided from MCP responses
   for the same reason candidates should be few — see
   [`lib/mcp/response.ts`](../lib/mcp/response.ts).
4. **Selection stays with the person.** The tool returns candidates; the editor
   picks; the pick fires the download trigger and then `uploadMediaFromUrl`.
   Per [`docs/MCP_SERVER.md`](MCP_SERVER.md), adding a tool means the plugin
   allowlist and the custom tools move together, so that the allowlist never
   understates the real surface.
5. **`aiGenerated: false` and a real `credit` on every upload from this path**,
   because a photograph relayed from Unsplash is exactly the case that default
   is wrong for.

Not recommended: an agent that chooses and attaches an image without a person
seeing it, a build-time or scheduled job that pre-fetches images, and any use of
the API outside the editorial drafting path.

Items 3 and 4 are revised by the plan below: the search returns no
`download_location`, and the pick goes through a dedicated import tool rather
than `uploadMediaFromUrl`. Why is in
[What the plan revises](#what-the-plan-revises).

## Implementation plan

Drawn up on 27 Sep 2026 against the code as it stands: `uploadMediaFromUrl` and
its outbound guard, the per-tool capability columns the plugin adds to
`payload-mcp-api-keys`, the consent screen that derives its grid from
`mcpTools`, and the attribution Finding 2 built. **Nothing below is built.** It
assumes Decision 1 is taken as recommended — store, fire the download trigger,
attribute with a working link — and says where it would change if it is not.

### What the plan revises

The earlier shape had the pick fire the download trigger and then hand the
photograph's address to `uploadMediaFromUrl`. Read closely, that is the wrong
seam, for four reasons, and each is a way the agent — or text the agent has
read — ends up deciding something the server should:

1. **The download trigger carries the access key.** `links.download_location`
   is authorised with the same `Client-ID` as the search. If the agent hands
   that address back, the server sends its credential wherever the agent says —
   [Finding 6](#finding-6-the-access-key-must-never-reach-the-agent) broken by a
   round trip rather than by design. The import has to take a photo id and build
   every Unsplash address itself.
2. **`uploadMediaFromUrl` defaults `aiGenerated` to true**, deliberately, and a
   relayed Unsplash photograph is exactly the case that default is wrong for.
   Relying on the agent to pass `false` every time is relying on the agent.
3. **It cannot carry the link.** It takes `credit` but has no `creditURL`
   parameter at all, so the attribution the API makes a condition of access
   would depend on an agent copying a name correctly and could never include
   the profile link.
4. **It does not know what it fetched.** No provenance, no way to notice the
   same photograph imported twice, and no way to check that the photograph is
   under the Unsplash License rather than Unsplash+ (below).

So the plan is two tools rather than one: a search that returns candidates and
nothing the agent needs to hand back but an id, and an import that takes the id
and derives everything else — bytes, credit, link, provenance,
`aiGenerated: false` — from Unsplash's own record, on the server.

### Before any code: what the owner does

- **Decisions 1, 3 and 4** in [Decisions needed](#decisions-needed). Decision 1
  shapes the whole plan; Decision 3 is the text the tool descriptions will
  carry; Decision 4 is who gets the tools on the day they ship.
- **Register an Unsplash application, and keep its access key out of every
  agent session.** It goes into `.env` on the VPS, set by the owner — a secret
  must never pass through an agent ([`AGENTS.md`](../AGENTS.md)). Only the
  access key is needed: nothing here acts as an Unsplash user, so the secret key
  and Unsplash's OAuth are not. Name the application to match `UTM_SOURCE` in
  [`lib/content/attribution.ts`](../lib/content/attribution.ts), because the
  guidelines ask for `utm_source=<your app name>` and the production review
  compares them.
- **Run `pnpm repair:content` against production**, which Decision 2 records as
  still outstanding. The production review in
  [Finding 4](#finding-4-rate-limits-are-not-the-constraint) looks at
  attribution on the live site, and 110 unlinked credits are what it would find.

### The workflow, as an agent sees it

1. `draftArticle`, unchanged.
2. `findStockPhoto` with a query and, usually, `orientation: landscape`. Up to
   six candidates come back, each with a small preview address.
3. The agent shows the previews to the person and **waits for a choice.**
   Nothing in the protocol enforces that; the tool description says it, and step
   6 is what bounds the cost of an agent that ignores it.
4. `importStockPhoto` with the chosen id and `alt` text. Returns a Media id.
5. `updatePosts` sets it as `featuredImage` — on a draft only, per the publish
   guard in [`MCP_SERVER.md`](MCP_SERVER.md).
6. A person publishes from the admin panel, with Live Preview showing the
   photograph above the headline — which is exactly the moment
   [Finding 5](#finding-5-the-editorial-risk-is-the-one-that-matters) needs a
   person at. An administrator-bound key, or a connector granted `publish.live`,
   can skip this step; see
   [Deliberately not in the plan](#deliberately-not-in-the-plan).

### The module: `lib/stock/unsplash.ts`

The only thing that imports the vendor, so a different library later is a
different module rather than a change to the tools
([Finding 7](#finding-7-one-vendor-one-library)).

- **Off unless configured.** It reads `UNSPLASH_ACCESS_KEY`; unset is the
  default, and both tools then answer that stock search is not configured on
  this deployment, without a network call. The tools are registered either way,
  for the reason `MCP_ENABLED` keeps the plugin's collection: each custom tool
  is a column on the API-key table, and schema must not depend on an environment
  variable.
- **Search** is `GET /search/photos` with `content_filter=high` and `per_page`
  of six. The API allows thirty; six is what a person can compare at a glance
  and what keeps the response small, for the reason
  [`lib/mcp/response.ts`](../lib/mcp/response.ts) elides bodies.
- **The import trusts `GET /photos/:id`**, the canonical record, and never
  anything that came back through the agent. The id is checked against a short
  alphanumeric pattern before it is put into a path.
- **The download trigger** requests `links.download_location` only when that
  address's origin is exactly `https://api.unsplash.com`. Anything else is not
  requested, and is logged. The key goes to one origin and no other.
- **Attribution is built here, from the record.** `credit` is
  `Photo by <name> / Unsplash` — the form all 110 existing credits take, so a new
  one reads like the old ones. `creditURL` is the photographer's
  `user.links.html`, stored bare: `attributionHref` adds the referral parameters
  at render, as it does for every existing credit. `sourceURL` is
  `https://unsplash.com/photos/<id>`, built from the id rather than copied from
  `links.html`, whose slugged form changes when a photograph's description does.
- **Transport.** Plain `fetch` with a ten-second timeout, sending
  `Authorization: Client-ID …` and `Accept-Version: v1` — never the `client_id`
  query parameter, which would put the key into every address anything logs.
  The JSON calls go to a fixed host, so they do not need
  [`lib/security/outbound-fetch.ts`](../lib/security/outbound-fetch.ts); the
  image bytes still go through `fetchPublicBytes`, for its size cap as much as
  its address checks.
- **Unsplash+ is refused.** Search results have been reported to include
  Unsplash+ photographs, which are licensed separately rather than under the
  Unsplash License, served from `plus.unsplash.com`, and marked by a `plus`
  boolean the official documentation does not describe. Both are checked and
  the host is the one relied on: a result whose `urls.raw` is not on
  `images.unsplash.com` is dropped from search and refused on import, whatever
  its flags say.
- **Errors are written for a model to act on** and passed through the way
  `OutboundFetchError` is: an invalid key (an operator problem, said as one,
  with the key never echoed), a spent hourly quota, a photograph that does not
  exist. Unsplash reports an exhausted quota through `X-Ratelimit-Remaining`
  and a 403 rather than a 429 — confirm that against a live response before
  matching on it. Anything unexpected is flattened, for the reason
  `uploadMediaFromUrl` flattens: it describes this server to its caller.

### The tools, in `lib/mcp/tools.ts`

| Tool               | Takes                                                                                  | Returns                                                                                                                                                                                                                       | Writes                                                 |
| ------------------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `findStockPhoto`   | `query`; optional `orientation` (`landscape`, `portrait`, `squarish`) and `page` (1–5) | Up to six candidates: `id`, Unsplash's `alt_description` as a starting point, `width`, `height`, a `preview` (`urls.small`), the photographer's name, and links to their profile and the photograph, with referral parameters | Nothing                                                |
| `importStockPhoto` | `photoId`, `alt` (required), optional `caption`                                        | The Media id and `url`; the `credit`, `creditURL` and `sourceURL` it wrote; `reused`                                                                                                                                          | One Media document, and one download event at Unsplash |

What the table leaves out is the design. `findStockPhoto` returns no
`download_location` and no full-size address, so there is nothing for the agent
to carry back but an id. `importStockPhoto` takes no `credit`, `creditURL`, or
`aiGenerated` — all three are derived, and `aiGenerated` is written `false`
because the record says what the picture is. Its steps, in order:

1. Look for an untrashed Media document with this `sourceURL`. If there is one,
   return it with `reused: true` — no second copy of the bytes, and no second
   download event, because nothing was downloaded.
2. Fetch the canonical record; refuse Unsplash+.
3. Fetch `urls.raw` with `w=2400&fit=max&fm=jpg&q=85` added to the parameters it
   already carries. The widest the post template draws a feature image is 44rem
   — 1408px on a 2x screen — and the `og` derivative wants 1200×630, so 2400
   leaves room for a redesign without storing a multi-megabyte original;
   `fit=max` never enlarges, and the result lands far under the 8MB agent
   ceiling. Then `vetImageBytes`, exactly as on the other two upload paths.
4. Create the Media document with `overrideAccess: false` and the key's user.
5. Fire the download trigger — after the create, so a failed upload never counts
   as a download. A trigger that fails does not undo the import; it is logged,
   and the tool's result says so.

**The descriptions carry the editorial rule.** Until Decision 3 is taken they
use Finding 5's wording: atmosphere, texture, abstraction, an essay about an
idea — never anything a reader could take as documentation of the work, place,
or person the article names. `findStockPhoto`'s also says to show the
candidates to the person and let them choose.

**A budget of its own.** The MCP limit is 120 requests per key per minute;
Unsplash's demo quota is 50 an hour for the whole deployment. One agent looping
on a search would spend the hour in under half a minute and leave every other
key without stock search until it reset. A `FixedWindowRateLimiter` per user —
20 calls an hour across both tools, overridable with
`RATE_LIMIT_STOCK_PER_HOUR` through the same `configuredLimit` as every other
limiter — holds one caller to a share of the quota. Finding 4 is why that
ceiling costs the real workflow nothing.

### Schema: one field, two capability columns, two migrations

**`media.sourceURL`.** Text, indexed, validated as https the way `creditURL` is.
Not unique, unlike `ghostURL`: Media is soft-deleted, and a unique column would
refuse to re-import a photograph somebody had put in the trash. The import's
lookup is what makes it idempotent. This is what makes "which pictures are
stock?" answerable — filter on `sourceURL` containing `unsplash.com` — for
everything imported from now on. The 110 migrated photographs cannot be
backfilled into it: Ghost kept the photographer's link, not the photograph's,
so their credit text is the only record, and it is enough to find them by.

**The capability columns need a hand-written `UPDATE`.** The plugin adds a boolean
column per custom tool to `payload_mcp_api_keys`, and the generator writes it as
`DEFAULT true` — that is what "custom tools default to ticked" in
[`MCP_SERVER.md`](MCP_SERVER.md) is, in SQL. On a new key it is the plugin's
documented behaviour. On existing rows it is a silent grant: every key, and
**every OAuth grant**, would gain two tools nobody ticked, and a grant's
approver was shown a consent screen that did not list them — the exact thing
`capabilityDocument` in [`lib/oauth/capabilities.ts`](../lib/oauth/capabilities.ts)
writes explicit `false`s to prevent. So the generated migration gets an
`UPDATE "payload_mcp_api_keys" SET … = false` after each `ADD COLUMN`, and an
existing key gets the tools when an administrator ticks them. This is the first
custom tool added since OAuth landed — `uploadMediaFromUrl` predates the consent
screen — which is why nothing has tripped on it yet. Grants have to be unticked;
whether plain API keys are too is Decision 4, and the recommendation is yes.

### Logging

**Media writes over MCP leave no `mcp_write` line today.** `recordMcpWrite` is on
Posts and Pages and not on Media, so for every image `uploadMedia` and
`uploadMediaFromUrl` have ever added, the log says which key called the tool
but not which document it made. Adding it to Media closes that for all three
upload paths, and is worth doing whether or not the rest of this is.

The import writes one line of its own, `mcp_stock`: the photo id, the Media id,
whether it was reused, and whether the download event landed — the one side
effect of this tool that is somebody else's record. Nothing else about either
call is logged, for the reason `mcp_request` records only the tool name.

### What does not change

**The Content Security Policy and `next/image`.** Bytes are stored, so the site
never loads anything from Unsplash; the previews in step 2 are shown by the
agent's client, not by this site. If Decision 1 goes to hotlinking, this is the
paragraph that changes: `images.unsplash.com` joins `img-src` in
[`lib/security/csp.ts`](../lib/security/csp.ts) and the remote patterns in
[`lib/security/images.ts`](../lib/security/images.ts), and the import writes an
address instead of a file.

### What the tests hold

Each row is an invariant above that would otherwise be one refactor away from
silently not holding.

| Invariant                                                                                                        | Held by                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| The key is sent to `https://api.unsplash.com` and nowhere else — including a `download_location` on another host | Unit tests on the module, with `fetch` stubbed                                                                                   |
| Unsplash+ never reaches Media, by flag or by host                                                                | The same                                                                                                                         |
| No error message contains the key                                                                                | The same                                                                                                                         |
| An unset key is a clear refusal and no network call                                                              | The same, and over the wire in [`e2e/mcp.spec.ts`](../e2e/mcp.spec.ts), where CI has no key — which is also production's default |
| `importStockPhoto` has no `credit`, `creditURL` or `aiGenerated` parameter, and writes `aiGenerated: false`      | [`tests/mcp/tools.test.ts`](../tests/mcp/tools.test.ts)                                                                          |
| `findStockPhoto` returns no `download_location` and no full-size address                                         | The same                                                                                                                         |
| The tool list, the e2e `tools/list` expectation and the seeded key's capabilities agree                          | The existing tool-list test, [`e2e/mcp.spec.ts`](../e2e/mcp.spec.ts), [`e2e/seed.ts`](../e2e/seed.ts)                            |
| `UNSPLASH_ACCESS_KEY` and the limit are in `.env.example` exactly when something reads them                      | [`tests/docs/drift.test.ts`](../tests/docs/drift.test.ts), unchanged                                                             |

### One pull request, one commit per change

In this order, each independently revertible:

1. **Record MCP media writes** — `recordMcpWrite` on Media. Stands on its own.
2. **`media.sourceURL`**, with its migration and regenerated types.
3. **The Unsplash module** and its tests, with `UNSPLASH_ACCESS_KEY` in
   `.env.example` — added here and not earlier, because the drift test fails a
   documented variable that nothing reads.
4. **The two tools**, the limiter, the capability migration with its
   hand-written `UPDATE`, and the e2e seed and expectation.
5. **Docs**: the tools table and the capability-default paragraph in
   [`MCP_SERVER.md`](MCP_SERVER.md), this document's status, and the drift
   test's `NOT_FILES` entry for the module, removed once the file exists.

Before pushing: `pnpm lint`, `pnpm typecheck`, `pnpm test`,
`pnpm format:check`, and `pnpm migrate:db` locally against a database holding
at least one existing key and one OAuth grant, to watch the `UPDATE` leave both
unticked.

### After merge

The deploy applies both migrations. Then, in order: set `UNSPLASH_ACCESS_KEY`
on the VPS and restart the app; tick the two tools on the key the owner drafts
with; import one photograph into a draft and read its credit in Live Preview —
linked, referral parameters present, Unsplash named. After a few real articles,
apply for production access with a screenshot of that credit. Nothing here
needs production access to work; the review is how Unsplash confirms the
attribution is right.

### Deliberately not in the plan

- **Choosing without a person.** No tool that searches and attaches in one
  call, and no `featuredImage` parameter on the import. An administrator key or
  a connector granted `publish.live` could still run steps 4 to 6 without
  anyone looking; for those, the containment is not ticking the stock tools,
  which belongs in the key's description rather than in code.
- **Images inside a body.** The import returns a Media id, and the Markdown
  drafting tools carry no image syntax today. Adding one is
  [`INSERTABLE_CONTENT_MODULES.md`](INSERTABLE_CONTENT_MODULES.md)'s ground.
- **Museum open-access sources.** The module boundary is drawn so a second
  library is a second module and a second pair of tools, not a change to these.
  The rights-reading problem in
  [Better sources](#better-sources-for-this-publication) is the real work there,
  and it is not this work.
- **Caching search responses.** At Finding 4's volume there is nothing to save.

## Decisions needed

1. **Store or hotlink** — [Finding 1](#finding-1-the-hotlinking-guideline-runs-against-the-media-pipeline).
   The recommendation is store, trigger the download endpoint, and attribute
   with a working link, adopted as a stated position.
2. ~~**Whether the attribution change is worth making on its own.**~~ Taken: it
   is built, because it repays 110 existing credits regardless of whether the
   API is adopted. What remains is running the backfill against production.
3. **Where stock imagery is allowed at all** —
   [Finding 5](#finding-5-the-editorial-risk-is-the-one-that-matters). This one
   is editorial policy, and no amount of code substitutes for it.
4. **Who gets the new tools on the day they ship** —
   [the capability columns](#schema-one-field-two-capability-columns-two-migrations).
   OAuth grants must not gain them silently: their approvers were never shown
   them. The recommendation is that existing API keys do not either, so the
   first key to search Unsplash is one an administrator chose; the alternative
   is to leave keys ticked, as `uploadMediaFromUrl` was, and untick only grants.
   It touches credentials, so it is the owner's call rather than the migration
   author's.

## References

- [Unsplash API documentation](https://unsplash.com/documentation)
- [Unsplash API Guidelines](https://help.unsplash.com/en/articles/2511245-unsplash-api-guidelines)
- [The Unsplash License](https://unsplash.com/license)
- [`docs/MCP_SERVER.md`](MCP_SERVER.md) — the endpoint a stock-search tool would
  be added to, and the reasoning that governs what may be added
- [`docs/DATABASE_MIGRATIONS.md`](DATABASE_MIGRATIONS.md) — what a `creditURL`
  field obliges
- [`docs/CONTENT_SECURITY_POLICY.md`](CONTENT_SECURITY_POLICY.md) — what
  hotlinking would oblige
