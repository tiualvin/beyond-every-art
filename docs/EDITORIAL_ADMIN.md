# The Editorial Admin

What the CMS does for the person writing in it, and why each piece is shaped
the way it is.

This document exists because nothing covered this surface. Every other area of
the project has one — the migration, SEO, the edge, MCP, the post layout — and
the admin panel had none, which is a fair record of how much attention it had
received. That was the right priority while a migration was the risk. The
cutover happened on 19 September 2026, and from that day the admin stopped
being scaffolding for a data move and became the place the publication is
made.

Read this before changing the shape of an edit screen, adding a custom admin
component, or touching anything under `components/admin/`.

## The rule that governs the layout

**Presentation must not become schema.**

The edit views for Posts and Pages are arranged with **unnamed tabs**. A named
tab is a group: it moves every field inside it into its own column and its own
place in the stored document. An unnamed tab is drawn and nothing else. So the
screen can be rearranged freely, and `pnpm migrate:db:create` reports "No schema
changes detected" against a commit that does nothing but rearrange it.

The same rule decides where the block picker's icons and groups live. They are
applied by mapping over `CONTENT_BLOCKS` in `blocks/schema.ts` rather than
written into each block definition, because those definitions are a contract
with every stored document that uses a block slug, and decoration should not sit
inside a contract.

### What this rule cost once

Arranging the tabs broke agent drafting, and no unit test noticed.

`contentEditorConfig` in `lib/mcp/markdown.ts` looked for the `content` field at
the top level of `fields`. That was true until it wasn't, and the failure was
invisible to almost everything: an unnamed tab changes no column and no stored
document, so every reader of the _data_ carried on working. That function reads
the _config_, and the config is exactly what a tab reshapes. `draftArticle`
started answering "No rich-text `content` field found on `posts`" — a sentence
about the schema that was not true of the schema.

Five tests broke the same way at the same time, for the same reason, and were
fixed by walking containers instead of the top level (`tests/support/fields.ts`).

So: **anything that reads a collection's fields must walk tabs.** If you add
such a reader, walk them. `grep` for `config.fields` before assuming the list is
flat.

## What is where, and why

**The sidebar holds decisions about the document.** Slug, publish date,
visibility, featured, byline, tags, review state, noindex, owners. These are the
things somebody decides _about_ an article rather than part of it, and they sit
beside the button that acts on them. They used to be scattered down a single
column below the search metadata.

**The Content tab holds the article.** Title, standfirst, cover, body — and
`legacyHTML`, which deliberately does **not** live under Migration with the rest
of the import bookkeeping. For a migrated article the rich-text editor is empty
and that field is the body the site renders, so filing it a tab away leaves the
article looking blank in the one place an editor is meant to read it. Its
description states the precedence: the rich-text editor wins whenever it has
anything in it.

**Search & sharing holds the metadata,** with a live preview of the likely
search result above it. **Migration holds the read-only import fields.**

## The custom components

Four, all under `components/admin/`. Each is small, and each exists because a
fact the database already held was not reachable without knowing which filter to
build by hand.

| Component            | Where                    | What it answers                           |
| -------------------- | ------------------------ | ----------------------------------------- |
| `EditorialDashboard` | Above the dashboard grid | What needs somebody today                 |
| `PublishReadiness`   | Post sidebar             | What is missing, while it is cheap to fix |
| `SearchPreview`      | Search & sharing tab     | What this looks like in a search result   |
| `MediaUsage`         | Media edit view          | What breaks if this image goes            |

Three constraints they share:

1. **They obey access control.** Server components count with
   `overrideAccess: false` and the signed-in user, so an author sees their own
   drafts and not the publication's. A panel running as root would be the one
   place in the admin where `access/roles.ts` did not hold.
2. **They never throw.** Every query is wrapped. The dashboard is the first
   screen after login and a field panel sits on the screen where work happens;
   a panel that fails must render as an absent row, never as a CMS that will not
   load.
3. **They state, they do not refuse.** `PublishReadiness` names what is missing
   and does not block the save or the publish. A draft is allowed to be
   incomplete — that is what a draft is — and a piece that wants no cover is a
   decision. A CMS that argues with an editor working alone is one they learn to
   route around.

## The import map

`payload generate:importmap` writes `importMap.js`. This project tracks
`importMap.ts`, and Next resolves `.ts` first — so running the generator bare
produces a file that looks like the answer, is not loaded, and leaves the
tracked map stale. Every symptom is at runtime and none of them is loud.

`docs/DEPLOYMENT_STATUS.md` records nine days of a blank admin from an import
map that was complete on one machine and missing an entry on the server. This is
the same shape.

So `pnpm generate:importmap` runs `scripts/generate-importmap.mjs`, which moves
the generated file onto the tracked one, and
`tests/collections/import-map.test.ts` fails if the `.js` is ever left behind or
if the config names a component the map does not carry.

**Run `pnpm generate:importmap` after adding or renaming any custom component,
and commit the result.**

## Styling

`app/(payload)/custom.css`, imported by `app/(payload)/layout.tsx` after
Payload's own stylesheet. Payload 3 has no `admin.css` config key; a stylesheet
is an import in the layout.

It is deliberately shallow: it sets Payload's own theme variables and styles
this project's four components. It reaches into no vendor internals, because a
selector aimed at Payload's markup is a thing that breaks on an upgrade for no
reader-visible gain. The palette tokens are copied from `app/globals.css` rather
than imported — that file is the public site's stylesheet and pulling it in here
would bring a whole design system into a page that wants eight colours.

## Related

- [`LIVE_PREVIEW.md`](LIVE_PREVIEW.md) — the preview iframe, and what globals do
  and do not get.
- [`INSERTABLE_CONTENT_MODULES.md`](INSERTABLE_CONTENT_MODULES.md) — the blocks
  the picker offers.
- [`MCP_SERVER.md`](MCP_SERVER.md) — the agent-facing half of the same
  collections.
- [`DATABASE_MIGRATIONS.md`](DATABASE_MIGRATIONS.md) — what to do when a change
  here does turn out to touch schema.
