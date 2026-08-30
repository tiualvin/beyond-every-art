# Beyond Every Art — Repository Context

This repository is for the migration of **Beyond Every Art** from Ghost to a self-hosted **Next.js + Payload CMS + PostgreSQL** platform, with Cloudflare and a low-cost VPS.

## Source of truth

Before planning or implementing work, read:

- [`docs/GHOST_TO_PAYLOAD_HANDOFF_WITH_APP_STRATEGY.md`](docs/GHOST_TO_PAYLOAD_HANDOFF_WITH_APP_STRATEGY.md)

That handoff defines the migration requirements, target architecture, data model, SEO constraints, deployment approach, acceptance criteria, and longer-term app strategy.

For post-migration website design work, also read
[`docs/WEBSITE_VISUAL_DIRECTION.md`](docs/WEBSITE_VISUAL_DIRECTION.md). It records
the supplied desktop and mobile concepts as a directional brief, not as approval
to redesign during Phase 1.

[`docs/PUBLICATION_SYSTEM.md`](docs/PUBLICATION_SYSTEM.md) records the planned
self-hosted digital publication system—the `/publication` archive, issue landing
pages, the full-screen reader, PDF processing worker, interactive hotspots,
transcripts, and first-party analytics. None of it is built, and it must not
displace migration or cutover work.

[`docs/INSERTABLE_CONTENT_MODULES.md`](docs/INSERTABLE_CONTENT_MODULES.md)
records the evaluated architecture for Ghost-style insertable blocks, reusable
snippets, signup modules, carousels, and affiliate product recommendations. It
refines—and maps itself back to—the handoff's "Reusable Content Blocks"
catalogue. None of it is built, and it must not displace migration or cutover
work. Read it before adding any Lexical block, block registry, or content
module.

[`docs/AUTONOMOUS_WORKSTREAMS.md`](docs/AUTONOMOUS_WORKSTREAMS.md) defines the
sequencing, shared invariants, ownership boundaries, and verification gates for
the repository's launch-readiness automation workstreams.

[`docs/MCP_SERVER.md`](docs/MCP_SERVER.md) covers the MCP server that exposes a
narrow slice of Payload to Claude and Codex for drafting articles. It is off
unless `MCP_ENABLED=1`, reaches no member, billing, or account data, and cannot
publish unless the key belongs to an administrator. Read it before widening the
collection allowlist, adding an MCP tool, or changing any agent-facing write
path into Payload — and keep the plugin allowlist and the custom tools in step,
so the allowlist never understates the real surface.

[`docs/SCREENSHOTS.md`](docs/SCREENSHOTS.md) covers `pnpm screenshot`, a
Playwright script for full-page QA captures against staging or production. It
also documents the TLS workaround needed for Chromium to reach the network at
all from inside the Claude Code sandbox.

## Open risk: the origin has no edge protection

Cloudflare is DNS-only, so nothing absorbs traffic in front of the VPS and the
origin IP is public. [`docs/EDGE_PROTECTION.md`](docs/EDGE_PROTECTION.md) has the
full procedure, the prepared Caddy image, and the reason the Cloudflare proxy
must not simply be switched on (it breaks HTTP-01 certificate renewal). It needs
a Cloudflare API token, so it cannot be finished without an operator.

**Close this before the public cutover.** Until it is closed, the only bounds on
request volume are the in-process limiters in `lib/security/rate-limit.ts`, which
are per-container and are not a defence against a distributed attacker. Do not
build anything that assumes otherwise.

## Current priority

The first priority is a safe, repeatable Ghost migration—not a redesign.

Preserve:

- Posts, pages, drafts, authors, tags, and publication dates
- Existing slugs, URLs, redirects, canonical URLs, and SEO metadata
- Featured images, embedded media, captions, and alt text
- Members and Stripe identifiers when applicable
- RSS, sitemap, robots behavior, and structured data

Keep the original Ghost site online until the final import, crawl comparison, redirect validation, media verification, backup restoration test, and production monitoring are complete.

## Initial technical direction

- Next.js App Router
- Payload CMS integrated with Next.js
- TypeScript
- PostgreSQL
- Cloudflare R2 for media
- Docker Compose on a low-cost VPS
- Caddy for reverse proxy and HTTPS
- Automated off-server backups

Use Payload's Local API for same-application server work where appropriate. Future mobile clients must use secured network APIs and must never receive administrative credentials or direct database access.

## Migration implementation rules

- Preserve Ghost-rendered HTML in a `legacyHTML` field before attempting rich-text conversion.
- Use the original Ghost ID as the idempotent external identifier.
- Migration scripts must support dry runs, logging, conflict reporting, and safe reruns.
- Do not hotlink production media to the old Ghost domain after migration.
- Do not rebuild every Ghost membership or newsletter feature during Phase 1 unless it is required for parity.
- Do not introduce mobile-app scope in a way that delays or destabilizes the website migration.

## Schema changes

Automatic schema push is disabled. Every change to a collection, global, or
field needs a generated migration committed with it
(`pnpm migrate:db:create <name>`), and CI fails when one is missing. Read
[`docs/DATABASE_MIGRATIONS.md`](docs/DATABASE_MIGRATIONS.md) before changing
schema. Schema commands are `migrate:db*`; the unprefixed `migrate:*` scripts
are the Ghost content migration and are unrelated.

## How to work in this repository

Decided with the repository owner, and recorded here because a working
agreement that lives in a chat transcript has to be renegotiated every session.

**Small fixes: make them, then say so.** A reversible, well-scoped improvement
found while doing something else should be fixed rather than filed — with the
reason in the commit and the finding named in the summary. What makes this safe
is the next rule, not restraint about scope.

**Decide by blast radius.** Judgment calls that are reversible in a deploy —
configuration, tests, internal code, documentation — are yours to make; state
the assumption where the next reader will find it. Stop and ask when a choice
touches:

- live URLs, canonical tags, redirects, or anything a crawler will cache;
- member, billing, or credential data;
- money, or a third party's records;
- a secret, which must never pass through an agent session.

The trailing-slash question in
[`docs/SEO_AND_REDIRECTS.md`](docs/SEO_AND_REDIRECTS.md) is the worked example:
it looks like a one-line config change and is actually a bet on migrated URLs
that is expensive to reverse after a recrawl.

**Package work as one pull request with one commit per change.** Related fixes
travel together so they are reviewed in context, and each stays independently
revertible. Drive CI to green before merging; a red `checks` job is never
something to merge past.

**Write down what you learn where it is enforced.** Prose drifts. When a fact
matters — an invariant, a constraint, a reason a thing is not the obvious
shape — prefer a test that fails when it stops being true.
[`tests/docs/drift.test.ts`](tests/docs/drift.test.ts) does this for the
documentation itself.

## Security and repository hygiene

Never commit:

- Ghost member exports
- Database dumps or site archives containing private data
- Production environment files
- API keys, passwords, tokens, Stripe secrets, or private credentials

Provide placeholder-only examples such as `.env.example`.

## Longer-term direction

After the website migration, backups, SEO, and production operation are stable, Payload may become the shared content and account platform for the Beyond Every Art companion experience and separately branded apps such as Dapple, Morrow, and Echo Garden. Keep the schema extensible, but do not build speculative app collections before their features are scheduled.
