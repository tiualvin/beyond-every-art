# Database Backup and Restore

This document describes the automated PostgreSQL backup pipeline and the
restoration procedure. It satisfies the Phase 1 acceptance criteria:

- Database backups run successfully.
- A database backup has been successfully restored.
- A documented restoration procedure exists.

Media is intended to live in Cloudflare R2, backed up by object storage
independently; this pipeline covers the Postgres database only. Both depend on
the same credentials — see
[Creating the R2 bucket](#creating-the-r2-bucket-first-time-setup) if they are
not set yet, because **until they are, this pipeline does not run at all**:
`buildBackupPlan` requires `S3_BUCKET` and throws on the missing variable
before anything is dumped.

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

## Creating the R2 bucket (first-time setup)

One bucket serves both media and these backups. Nothing in the application
needs changing — `useR2` in `payload.config.ts` is
`Boolean(S3_BUCKET && S3_ENDPOINT)`, and every service that needs the
credentials (`app`, `migrate`, `backup`) already loads `.env`.

At this project's scale the free tier covers it: 10 GB-month of storage, 1
million writes and 10 million reads per month, and no egress charge. The Ghost
archive is around 1,374 media files, which would each have to average over 7 MB
to breach the storage allowance.

1. **Create the bucket.** Cloudflare dashboard → R2 → Create bucket, e.g.
   `beyond-every-art-media`. Location hint EU, matching the VPS. Enabling R2
   may require a payment method on the account even for free-tier use.
2. **Create a scoped API token.** R2 → Manage API Tokens → Create API token,
   permission **Object Read & Write**, scoped to that one bucket rather than
   all of them. Copy the secret access key immediately; it is shown once.
3. **Find the endpoint.** Take the Account ID from the R2 overview page:
   `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.
4. **Set them in `.env` on the VPS** — never in git, and never in
   `.env.example`, which keeps placeholders only:

   ```bash
   S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
   S3_REGION=auto
   S3_BUCKET=beyond-every-art-media
   S3_ACCESS_KEY_ID=<access key id>
   S3_SECRET_ACCESS_KEY=<secret access key>
   ```

   `S3_BUCKET` and `S3_ENDPOINT` are what switch storage over; the two
   credentials are then asserted non-null immediately after, so all four have
   to arrive together or the app throws at boot.

   Leave `S3_PUBLIC_URL` unset unless you are serving the bucket publicly. This
   configuration does not set `disablePayloadAccessControl`, so Payload keeps
   serving media through its own `/api/media/file/<name>` route with R2 behind
   it. The variable exists to add a public media origin to `next/image`'s
   `remotePatterns` and to the CSP's `img-src`, `connect-src` and `media-src`
   — pointing it at a bucket that is not actually public just widens the policy
   for no reason.

5. **Recreate the containers**, since an `.env` change does not reach a running
   one:

   ```bash
   docker compose up -d
   ```

6. **Verify backups before media.** This is the step that was silently failing,
   and it is the more serious of the two:

   ```bash
   docker compose run --rm backup pnpm backup:db
   ```

   An object should appear in R2 under `db-backups/`. If it names a missing
   variable instead, that variable did not reach the container.

7. **Re-import the media** so the files land in the bucket:

   ```bash
   docker compose run --rm migrate pnpm migrate:ghost --input <export.json>
   ```

   It re-downloads from the still-live Ghost site and is idempotent, keyed on
   `ghostURL`. It restores only what the export contains — anything uploaded
   through Payload Admin since the original import is not in that file and will
   not come back, so check for such files before relying on this.

8. **Confirm.** Images render on the site, and
   `docker compose logs app | grep media` no longer reports files missing on
   disk.

Keep the `media_data` volume until R2 is proven. It costs nothing and it is the
fallback if a credential is wrong.

## Scheduled backups (production)

The `backup` service in `docker-compose.yml` runs the script on a cron schedule
(default 03:00 daily) inside a small container with the Postgres client and
`tsx`. Bring it up alongside the rest of the stack:

```bash
docker compose up -d
docker compose logs -f backup   # watch each nightly run
```

Set the R2 and `BACKUP_*` variables in `.env` before starting — see
[Creating the R2 bucket](#creating-the-r2-bucket-first-time-setup). Without
them the container starts, wakes on schedule, and fails every run on the
missing variable, which looks like nothing happening at all. To take an
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
