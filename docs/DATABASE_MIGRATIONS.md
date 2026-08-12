# Database migrations

Schema changes reach a database by replaying committed SQL, in every
environment, including yours. This document is the workflow.

Not to be confused with the **Ghost content migration** (`pnpm migrate:ghost`,
`migrate:redirects`, `migrate:members`), which moves articles and members into
Payload. That is content; this is table structure. The script names keep them
apart: schema commands are all `migrate:db*`.

## Why push is off

Payload's Postgres adapter can reshape a database directly from the config —
`push` — and it defaults to on everywhere except production. That default is
the problem. A developer machine and CI would quietly rebuild themselves from
whatever the config currently says, while production, where push is off, waited
for a migration nobody had written. Nothing reports the divergence; it surfaces
as a query failing against real data after a deploy.

So `payload.config.ts` sets `push: false`. Every environment takes the same
path, and `pnpm build` is no longer the only way to find out whether a schema
change works.

The cost is one command per schema change, and CI fails if you skip it.

## Commands

| Command                         | Does                                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| `pnpm migrate:db`               | Applies pending migrations. Safe to rerun; already-applied ones are skipped.        |
| `pnpm migrate:db:create <name>` | Generates a migration from the difference between the config and the last snapshot. |
| `pnpm migrate:db:status`        | Lists every migration and whether it has run.                                       |
| `pnpm migrate:db:down`          | Rolls back the most recent batch.                                                   |
| `pnpm migrate:db:baseline`      | One-time adoption for a database that predates migrations. See below.               |

Payload's CLI also offers `migrate:fresh`, `migrate:refresh`, and
`migrate:reset`. They drop data and are deliberately not exposed as scripts.

`migrate:db` goes through `scripts/run-migrations.mjs` rather than calling
`payload migrate` directly. The CLI can exit 0 having done nothing at all — it
transpiles itself through tsx's ESM loader and floats the resulting promise, so
a stalled loader leaves nothing holding the event loop open and Node exits
cleanly without an error or a database connection. Observed in CI as a 1.7s
migrate that printed nothing against an empty schema, where a healthy run takes
about four seconds. The wrapper requires the CLI's own start and `Done.` markers
in the output before reporting success, retries up to three times when they are
missing, and passes a genuine non-zero exit straight through. It wraps the
script rather than the CI step so the release migrator container is covered too.

**`migrate:db:create` has the same fault and no wrapper.** It is the same
entry point, so it too can exit 0 having generated nothing — no file written,
no error, nothing in the output to distinguish it from a run that found no
changes. Seen while adding `media.aiGenerated`: the command printed its two
banner lines and stopped. Unlike `migrate:db` this fails quietly rather than
loudly, because the missing migration only surfaces later, in CI's drift check
or on a deploy against a schema that never got the column.

If it produces no file for a change you know you made, use the alternate entry
point the wrapper falls back to — Node registers the loader before any of the
CLI's own code runs, so there is nothing to stall:

```bash
node --import tsx node_modules/payload/bin.js migrate:create <name> \
  --disable-transpile --skip-empty
```

Wrapping this script the way `migrate:db` is wrapped is worth doing; the marker
to require is `Migration created at`, or a clean exit with `--skip-empty` and
genuinely no schema change.

## Changing the schema

1. Edit the collection, global, or field.
2. Run `pnpm generate:types` — the rest of the codebase typechecks against it.
3. Run `pnpm migrate:db:create <short_name>`, e.g. `add_mcp_api_keys`.
4. **Read the generated SQL.** The generator is good at additive changes and
   worth distrusting on renames: a renamed field usually generates a `DROP
COLUMN` plus an `ADD COLUMN`, which is data loss wearing a rename's clothes.
   If that is what you see, write the `ALTER TABLE ... RENAME COLUMN` by hand.
5. Run `pnpm migrate:db` against your local database and confirm it applies.
6. Commit the `.ts` migration, its `.json` snapshot, and the updated
   `migrations/index.ts` together. The snapshot is what the next migration
   diffs against; without it the following change regenerates the world.

CI runs `pnpm migrate:db:create ci_drift_check --skip-empty` on every push and
fails if it produces a file — that means a schema change arrived without its
migration.

One side effect worth knowing: any Payload CLI command that boots the config,
`migrate:db:create` included, rewrites the generated and gitignored
`payload-types.ts`. That is why the CI job runs `format:check`, `lint`,
`typecheck`, and `test` **before** it touches Payload — otherwise those steps
would see generated types a clean checkout does not have, and `typecheck` would
pass on code the Docker build cannot compile. Keep new steps that boot Payload
below that block.

## Local setup

```bash
docker compose up -d postgres
pnpm migrate:db          # build the schema
pnpm seed:dev            # optional sample content
pnpm dev
```

A database that has never been migrated has no tables at all, so `seed:dev`,
`migrate:ghost`, and the app itself will fail until `pnpm migrate:db` has run
once. `pnpm test:e2e:local` runs it for you.

## Deployment

The deploy job in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)
runs migrations **before** replacing containers:

```bash
docker compose build migrate
docker compose run --rm migrate
docker compose up -d --build --wait --wait-timeout 180
```

A failed migration therefore stops the deploy with the previous release still
serving an unchanged database, rather than starting a new release against a
schema it does not match.

The `migrate` service is behind a Compose profile so `docker compose up` never
starts it. That is not cosmetic: the deploy waits on container health with
`--wait`, and a service designed to exit does not fit that model. It builds
from the `migrator` stage in the [`Dockerfile`](../Dockerfile), which keeps the
full dependency tree and sources — the runtime image is a Next.js standalone
bundle and does not contain the Payload CLI, so it cannot migrate its own
database.

To run one by hand on the VPS:

```bash
docker compose run --rm migrate
docker compose run --rm migrate pnpm migrate:db:status
```

## One-time baseline for the existing production database

The production database on the VPS was created by automatic push, before
`migrations/` existed. Its tables are already there, so the initial migration
would fail on its first `CREATE TABLE`. It has to be told that migration is
already applied, once, before the first deploy that carries this change:

```bash
docker compose run --rm migrate pnpm migrate:db:baseline --dry-run
docker compose run --rm migrate pnpm migrate:db:baseline
docker compose run --rm migrate pnpm migrate:db:status
```

Take a backup first — `pnpm backup:db`, per
[`BACKUP_AND_RESTORE.md`](BACKUP_AND_RESTORE.md).

The script inspects the database and reports before it writes:

- **schema present, nothing recorded** → records the initial migration as
  applied, and only ever that one;
- **no schema** → does nothing and tells you to run `pnpm migrate:db`, which is
  the correct path for a fresh database;
- **already baselined** → does nothing, so it is safe to rerun;
- **other migrations recorded but not the initial one** → refuses, because that
  is not a pre-migrations database and baselining it would permanently skip a
  real migration.

Nothing else needs baselining. A database created from this commit onwards
starts with `pnpm migrate:db` and never sees this command.

## Restores

[`BACKUP_AND_RESTORE.md`](BACKUP_AND_RESTORE.md) is unchanged: a `pg_dump`
restore carries its own schema, including `payload_migrations`. Restore, then
run `pnpm migrate:db` to apply anything newer than the backup.
