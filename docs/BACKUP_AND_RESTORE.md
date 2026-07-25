# Database Backup and Restore

This document describes the automated PostgreSQL backup pipeline and the
restoration procedure. It satisfies the Phase 1 acceptance criteria:

- Database backups run successfully.
- A database backup has been successfully restored.
- A documented restoration procedure exists.

Media lives in Cloudflare R2 and is backed up by object storage independently;
this pipeline covers the Postgres database only.

## How it works

`pnpm backup:db` runs `pg_dump` (plain SQL), gzips the output, and uploads it to
Cloudflare R2 under a timestamped key such as:

```
db-backups/beyond_every_art-20260724T030000Z.sql.gz
```

After a successful upload it deletes backups beyond `BACKUP_RETENTION_COUNT`
(default 14), keeping the most recent ones. Each run creates a new object, so
runs never overwrite one another and the script is safe to rerun.

Backups reuse the media R2 credentials (`S3_*`). Set `BACKUP_S3_BUCKET` only if
you want backups in a bucket separate from media. Relevant variables (see
`.env.example`):

| Variable                                                               | Default      | Purpose                                  |
| ---------------------------------------------------------------------- | ------------ | ---------------------------------------- |
| `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION` | —            | R2 credentials (shared with media)       |
| `BACKUP_S3_BUCKET`                                                     | `S3_BUCKET`  | Destination bucket                       |
| `BACKUP_PREFIX`                                                        | `db-backups` | Key prefix backups live under            |
| `BACKUP_RETENTION_COUNT`                                               | `14`         | Number of newest backups to keep         |
| `BACKUP_CRON`                                                          | `0 3 * * *`  | Schedule (backup container only)         |
| `BACKUP_ON_START`                                                      | `false`      | Run one backup when the container starts |

## Scheduled backups (production)

The `backup` service in `docker-compose.yml` runs the script on a cron schedule
(default 03:00 daily) inside a small container with the Postgres client and
`tsx`. Bring it up alongside the rest of the stack:

```bash
docker compose up -d
docker compose logs -f backup   # watch each nightly run
```

Set the R2 and `BACKUP_*` variables in `.env` before starting. To take an
immediate backup for verification, set `BACKUP_ON_START=true` (or run the
on-demand command below).

## On-demand backup

```bash
# Show the plan without writing anything (lists existing backups + prune plan).
pnpm backup:db --dry-run

# Take a real backup, upload it, and prune old ones.
pnpm backup:db

# Dump locally without uploading (useful for a quick local snapshot).
pnpm backup:db --skip-upload --output ./beyond_every_art.sql.gz
```

`pg_dump` and `psql` must be on `PATH` when running these on a host. Inside the
`backup` container they are already installed.

## Restore procedure

Restoring is **destructive** — it runs the dump's SQL against the target
database — so a real restore requires an explicit `--yes`.

### 1. Verify a backup (safe, non-destructive)

```bash
pnpm restore:db --latest --dry-run
```

This downloads the newest backup, confirms it decompresses, and reports its
size without touching any database. Use `--input <key>` to check a specific
backup or `--input-file <path>` for a local archive.

### 2. Restore into a scratch database first (recommended)

Never rehearse a restore against production. Create an empty database and
restore into it with `--target`:

```bash
createdb beyond_every_art_restore
pnpm restore:db --latest --target \
  postgresql://payload:payload@localhost:5432/beyond_every_art_restore --yes
```

Then spot-check row counts and recent content before trusting the backup.

### 3. Restore into the real target

Only after the scratch restore looks correct:

```bash
# Defaults to DATABASE_URI when --target is omitted.
pnpm restore:db --latest --yes
```

Restore a specific backup instead of the latest:

```bash
pnpm restore:db --input db-backups/beyond_every_art-20260724T030000Z.sql.gz --yes
```

### Restoring inside Docker

Run the command in a throwaway backup container, which already has the tools and
environment:

```bash
docker compose run --rm backup \
  tsx scripts/restore-database.ts --latest --dry-run
```

Drop `--dry-run` and add `--yes` to perform the restore. For a full-database
restore you generally want the app stopped first (`docker compose stop app`) and
an empty target; recreate the database if needed before restoring.

## Recovery checklist

- [ ] `pnpm backup:db` completes and the object appears in R2.
- [ ] `pnpm restore:db --latest --dry-run` reports a valid, decompressible archive.
- [ ] A restore into a scratch database reproduces expected content and counts.
- [ ] Retention pruning keeps exactly `BACKUP_RETENTION_COUNT` backups.
- [ ] R2 credentials and `.env` are backed up securely and separately from Git.
