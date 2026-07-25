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

## Create the first administrator

Public account creation is disabled. With an empty `users` collection, set the
three temporary bootstrap variables documented in `.env.example`, then run:

```bash
pnpm bootstrap:admin
```

The command creates exactly one administrator and refuses to run once any user
exists. Remove the bootstrap values from your environment immediately afterward.
Additional accounts must be created by an administrator in Payload Admin.

## Editorial roles

- Administrators manage accounts, all editorial collections, migration member
  records, and site-wide globals.
- Editors manage editorial collections and redirects, but not accounts, member
  records, or site-wide globals.
- Authors may create posts, publish posts privately assigned to them, and delete
  their assigned drafts. They cannot delete published posts or manage pages.

Public author profiles and private CMS accounts are separate. The private
`owners` field controls post editing; the `authors` field controls public bylines.

Ghost member records are preserved in an administrator-only collection and are
not CMS login accounts. Keep the original member export encrypted outside Git,
with its decryption key stored separately.

## Migration dry run

Only synthetic fixtures belong in Git. Never commit Ghost exports, member CSVs, database dumps, site archives, or credentials.

```bash
pnpm migrate:ghost --dry-run --input tests/fixtures/ghost-export.json
```

Drop the `--dry-run` flag to write posts, pages, authors, tags, and media into
Payload. The importer accepts both the Ghost 6.x flat `{ meta, data }` export
shape and the legacy `db[0].data` shape from older Ghost versions, and is safe
to rerun (it upserts by `ghostID`).

Redirects and members are migrated separately, since Ghost exports them as
their own files:

```bash
pnpm migrate:redirects --dry-run --input ghost-export/redirects.json
pnpm migrate:members --dry-run --input ghost-export/ghost-members.csv
```

Both also accept a real run without `--dry-run` and are safe to rerun.

After importing, validate that Payload matches the Ghost export (missing
records, draft/published drift, lost feature images, changed slugs or dates):

```bash
pnpm migrate:validate --input ghost-export/ghost-content.json
```

CI runs both halves against a throwaway Postgres service on every push, using
two synthetic fixtures:

- `tests/fixtures/ghost-export.json` carries deliberate conflicts (duplicate
  slugs, missing authors and tags) and is only ever dry-run, so the conflict
  reporting stays covered.
- `tests/fixtures/ghost-export-clean.json` is conflict-free and is imported for
  real (twice, to prove reruns are safe) and then validated, so the importer and
  the validator have to agree end to end. Media import is skipped there: the
  fixture's asset URLs are synthetic and cannot be downloaded.

## Staging and launch

Protect a pre-launch staging deployment from indexing and public access:

- `NEXT_PUBLIC_NOINDEX=1` — `robots.txt` disallows all and pages emit a
  `noindex` meta tag.
- `STAGING_BASIC_AUTH=user:password` — gates the whole site behind HTTP Basic
  Auth.

`/health` returns a JSON liveness + database readiness probe for the reverse
proxy, container healthcheck, and uptime monitoring. The app also writes
structured JSON log lines for the two failures that matter during cutover:
`{"event":"request_error"}` for server errors and `{"event":"not_found"}` for a
post, page, tag, or author URL that no longer resolves (asset and scanner
probes are filtered out). Follow
[`docs/MIGRATION_REHEARSAL.md`](docs/MIGRATION_REHEARSAL.md) and
[`docs/CUTOVER_RUNBOOK.md`](docs/CUTOVER_RUNBOOK.md) for the rehearsal and
production switch.

## Database backups

Nightly PostgreSQL backups are dumped, gzipped, and uploaded to Cloudflare R2,
with old backups pruned to a retention count. In production the `backup` service
in `docker-compose.yml` runs them on a schedule. On demand:

```bash
pnpm backup:db --dry-run          # show the plan, write nothing
pnpm backup:db                    # dump, upload, prune
pnpm restore:db --latest --dry-run  # verify the newest backup
```

See [`docs/BACKUP_AND_RESTORE.md`](docs/BACKUP_AND_RESTORE.md) for the full
restore procedure and recovery checklist.

## Checks

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
docker compose config
```
