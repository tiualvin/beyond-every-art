# Stock imagery, and the Unsplash API

## Summary

- **Status:** evaluated. No Unsplash dependency added and no key issued — the
  API itself is not built and the decisions below gate it. What _is_ built is
  the attribution the guidelines require, because it repays the credits already
  on the site regardless: see
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
