<!--
Beyond Every Art — Ghost → Payload migration.
Read docs/GHOST_TO_PAYLOAD_HANDOFF_WITH_APP_STRATEGY.md and AGENTS.md before opening a PR.
The first priority is a safe, repeatable migration — not a redesign.
-->

## Summary

<!-- What does this PR do, and why? Link any related issue. -->

## Type of change

- [ ] Migration tooling (import, validation, conflict handling)
- [ ] Content model / Payload collection or global
- [ ] Frontend (Next.js)
- [ ] Infrastructure / deployment (Docker, Caddy, CI)
- [ ] Docs
- [ ] Other:

## Migration, data safety & SEO impact

<!-- Describe effects on migrated content and the live site. Write "N/A" where a line does not apply. -->

- **Slugs / URLs:**
- **Redirects & canonical URLs:**
- **SEO metadata / structured data / sitemap / RSS:**
- **Media (featured images, embeds, captions, alt text):**
- **Idempotency:** uses Ghost ID as the external key; safe to re-run:
- **Rollback plan:**

## Testing

<!-- Commands you ran and their results. -->

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm migrate:ghost --dry-run --input tests/fixtures/ghost-export.json
pnpm build
```

<!-- Attach a screenshot for any visible frontend change. -->

## Checklist

- [ ] No Ghost exports, member data, database dumps, site archives, or credentials are included (only synthetic fixtures / placeholder `.env.example`).
- [ ] Migration changes support dry runs, logging, conflict reporting, and safe reruns.
- [ ] Original Ghost-rendered HTML is preserved in `legacyHTML` before any rich-text conversion.
- [ ] URL, canonical, redirect, media, and SEO effects are documented above.
- [ ] Visible frontend changes include a screenshot.
- [ ] Deployment and rollback considerations are documented.
- [ ] Changes align with `docs/GHOST_TO_PAYLOAD_HANDOFF_WITH_APP_STRATEGY.md` and `AGENTS.md`.
