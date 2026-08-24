# Database Backup and Restore

This document describes the automated PostgreSQL backup pipeline and the
restoration procedure. It satisfies the Phase 1 acceptance criteria:

- Database backups run successfully.
- A database backup has been successfully restored.
- A documented restoration procedure exists.

This pipeline covers the Postgres database only.

**Media is not covered by anything here, and is not backed up by being in R2.**
Object storage is durable, not versioned: a delete or an overwrite is final, and
`S3_*` must actually be set for uploads to reach R2 at all — unset, Payload
writes to a Docker volume on the VPS instead, which no backup touches. An
earlier version of this document asserted the opposite, and the gap it hid was
real: every migrated image was lost when a rebuild discarded the container's
writable layer, and nothing noticed until the site rendered broken images.
`pnpm restore:media` exists because of that, and recovers only what the old
Ghost site can still serve.

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
| `BACKUP_ENCRYPTION_KEY`                                                | unset        | Passphrase to encrypt backups at rest    |
| `BACKUP_CRON`                                                          | `0 3 * * *`  | Schedule (backup container only)         |
| `BACKUP_ON_START`                                                      | `false`      | Run one backup when the container starts |

## Encryption

A dump contains the entire `members` archive — addresses, Stripe customer and
subscription identifiers, internal notes, engagement statistics. The same
`S3_*` credentials serve media and backups, so without encryption one leaked
key exposes both.

Set `BACKUP_ENCRYPTION_KEY` and every new backup is wrapped in AES-256-GCM,
with the key derived from the passphrase by scrypt and a fresh salt per run.
Encrypted objects take a `.enc` suffix:

```
db-backups/beyond_every_art-20260724T030000Z.sql.gz.enc
```

```bash
openssl rand -base64 32   # generate one; store it outside this server
```

Four things to know before turning it on:

- **Losing the passphrase loses the backups.** There is no recovery path, by
  design. Keep a copy somewhere that is neither this VPS nor the backup bucket,
  because both are exactly what a backup exists to survive.
- **Rotating it does not re-encrypt anything.** Older objects still need the
  previous value, so keep it until they have aged out of the retention window.
- **Unset means unencrypted, and the run says so.** Every backup report carries
  a warning while the key is missing. Refusing to run without one would turn a
  readable backup into no backup at all, which is worse.
- **Restore needs no flag.** Whether an archive is encrypted is read from its
  own header, so backups taken before this existed keep restoring unchanged and
  a mixed bucket is handled without thinking about it. Retention treats both as
  one series.

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

The last form needs no storage configuration at all — only `DATABASE_URI` and,
if you want the archive encrypted, `BACKUP_ENCRYPTION_KEY`. Same for a restore
from `--input-file`. Those are the commands reached for during an incident, on
whichever machine can still reach the database, so they do not ask for
credentials they never use.

## Restore procedure

Restoring is **destructive** — it runs the dump's SQL against the target
database — so a real restore requires an explicit `--yes`.

### 1. Verify a backup (safe, non-destructive)

```bash
pnpm restore:db --latest --dry-run
```

This downloads the newest backup, confirms it decrypts and decompresses, and
reports its size without touching any database. Use `--input <key>` to check a
specific backup or `--input-file <path>` for a local archive.

Worth doing on a schedule, not only during an incident: a dry run is the only
thing that proves `BACKUP_ENCRYPTION_KEY` is still the passphrase the bucket
was written with. A rotated key breaks every restore silently, and the nightly
backup keeps succeeding while it does — it only encrypts, it never reads one
back.

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
docker compose run --rm --entrypoint tsx backup \
  scripts/restore-database.ts --latest --dry-run
```

`--entrypoint` is required, not decoration. The backup image starts a cron
scheduler and ignores anything passed after the image name, so without it this
command silently starts the nightly scheduler in the foreground and restores
nothing — which is a poor thing to discover during a restore.

Drop `--dry-run` and add `--yes` to perform the restore. For a full-database
restore you generally want the app stopped first (`docker compose stop app`) and
an empty target; recreate the database if needed before restoring.

## The drill CI runs on every change

`checks` performs a complete restore drill against the CI database: it takes an
encrypted dump with `--skip-upload`, restores it into a scratch database with
`--input-file --target`, compares row counts table by table, and then runs
`migrate:validate` against the restored copy so the content is checked for
substance and not only for arriving. No bucket and no credentials are involved,
because what needs proving on every commit is the archive and the restore path,
not R2's availability that morning.

It does not replace the checklist below. CI proves the mechanism; only a real
run proves that _this_ bucket, holding _these_ objects, encrypted with the
passphrase currently in the production environment file, can be read back.

## Recovery checklist

- [ ] A backup completes and the object appears in R2:
      `docker compose run --rm --entrypoint tsx backup scripts/backup-database.ts`
- [ ] `pnpm restore:db --latest --dry-run` reports a valid, decompressible archive.
- [ ] A restore into a scratch database reproduces expected content and counts.
- [ ] Retention pruning keeps exactly `BACKUP_RETENTION_COUNT` backups.
- [ ] R2 credentials and `.env` are backed up securely and separately from Git.
