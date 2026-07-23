# Beyond Every Art — Repository Context

This repository is for the migration of **Beyond Every Art** from Ghost to a self-hosted **Next.js + Payload CMS + PostgreSQL** platform, with Cloudflare and a low-cost VPS.

## Source of truth

Before planning or implementing work, read:

- [`docs/GHOST_TO_PAYLOAD_HANDOFF_WITH_APP_STRATEGY.md`](docs/GHOST_TO_PAYLOAD_HANDOFF_WITH_APP_STRATEGY.md)

That handoff defines the migration requirements, target architecture, data model, SEO constraints, deployment approach, acceptance criteria, and longer-term app strategy.

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

## Security and repository hygiene

Never commit:

- Ghost member exports
- Database dumps or site archives containing private data
- Production environment files
- API keys, passwords, tokens, Stripe secrets, or private credentials

Provide placeholder-only examples such as `.env.example`.

## Longer-term direction

After the website migration, backups, SEO, and production operation are stable, Payload may become the shared content and account platform for the Beyond Every Art companion experience and separately branded apps such as Dapple, Morrow, and Echo Garden. Keep the schema extensible, but do not build speculative app collections before their features are scheduled.
