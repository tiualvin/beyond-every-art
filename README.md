# Beyond Every Art

Migration-first Next.js and Payload CMS foundation for moving Beyond Every Art from Ghost. Read `docs/GHOST_TO_PAYLOAD_HANDOFF_WITH_APP_STRATEGY.md` before making implementation decisions.

## Local setup

1. Install Node 20 and enable Corepack: `corepack enable`.
2. Copy `.env.example` to `.env` and replace the development secret.
3. Start PostgreSQL: `docker compose up -d postgres`.
4. Install dependencies: `pnpm install` (commit the generated `pnpm-lock.yaml`).
5. Generate Payload types: `pnpm generate:types`.
6. Start the application: `pnpm dev`.

Payload Admin is available at <http://localhost:3000/admin>.

## Migration dry run

Only synthetic fixtures belong in Git. Never commit Ghost exports, member CSVs, database dumps, site archives, or credentials.

```bash
pnpm migrate:ghost --dry-run --input tests/fixtures/ghost-export.json
```

The non-dry-run importer intentionally exits without writing until the collection import and media adapters are implemented and tested.

## Checks

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
docker compose config
```
