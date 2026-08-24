#!/bin/sh
# Entrypoint for the backup container. Installs the cron schedules that run the
# database backup and the restore verification, and streams their output to the
# container log so `docker compose logs backup` shows each run.
#
# Environment:
#   BACKUP_CRON          cron schedule for the backup (default: 0 3 * * *)
#   BACKUP_ON_START      run one backup immediately on container start (default false)
#   RESTORE_VERIFY_CRON  cron schedule for the restore check (default: 0 4 * * 0)
#                        set to "off" to install no verification job. A blank
#                        value is not the switch: `:-` below, and the same
#                        default in docker-compose.yml, both read empty as
#                        unset and fall back to the schedule.
# plus the DATABASE_URI / S3_* / BACKUP_* variables read by backup-database.ts.
#
# Why two jobs rather than one. `backup-database.ts` only ever writes: it dumps,
# encrypts, uploads, and prunes, and never reads an archive back. So every
# failure mode on the read side is silent while the log fills with successful
# backups — a rotated BACKUP_ENCRYPTION_KEY being the one that matters, because
# it breaks every restore in the bucket and nothing says so until an incident.
# `restore-database.ts --latest --dry-run` downloads the newest object,
# decrypts, and decompresses it without touching a database, which is the only
# thing that proves the passphrase still matches what the bucket was written
# with. Weekly, an hour after the nightly backup, so it verifies the object that
# run just produced. See docs/BACKUP_AND_RESTORE.md.
set -eu

CRON="${BACKUP_CRON:-0 3 * * *}"
VERIFY_CRON="${RESTORE_VERIFY_CRON:-0 4 * * 0}"
LOG=/var/log/backup.log
ENV_FILE=/app/.backup-env

# busybox crond runs jobs with a minimal environment, so persist the current
# runtime environment for the cron job to source. Values here are simple
# connection strings and keys with no embedded newlines.
printenv | sed 's/^\([^=]*\)=\(.*\)$/export \1="\2"/' >"$ENV_FILE"
# It holds the backup passphrase and the storage credentials, so it is readable
# by root and nobody else.
chmod 600 "$ENV_FILE"

touch "$LOG"
mkdir -p /etc/crontabs

# Two rules govern everything written into this crontab.
#
# `--dry-run` is not decoration: it is what keeps a scheduled job away from the
# destructive path. restore-database.ts refuses to write without `--yes`, and no
# schedule in this file may ever pass it — a cron entry that restores is a cron
# entry that overwrites the live database on a timer.
#
# And no command here may contain a literal `%`. cron reads one as a newline and
# feeds everything after it to the job as stdin, so a `date +%F` in a job line
# silently truncates the command. Docker timestamps the stream anyway
# (`docker compose logs -t backup`), so the marker below is a static string.
# The emptiness check is not the documented switch — `off` is — but it keeps a
# blank value that somehow reaches here from writing a crontab line that starts
# with whitespace, which crond would reject once a minute for the life of the
# container.
{
  echo "$CRON . $ENV_FILE; cd /app && tsx scripts/backup-database.ts >> $LOG 2>&1"
  if [ -n "$VERIFY_CRON" ] && [ "$VERIFY_CRON" != "off" ]; then
    echo "$VERIFY_CRON . $ENV_FILE; cd /app && { echo \"--- restore verification\"; tsx scripts/restore-database.ts --latest --dry-run || echo \"Restore verification FAILED - the newest backup could not be read back (see above).\"; } >> $LOG 2>&1"
  fi
} >/etc/crontabs/root

if [ "${BACKUP_ON_START:-false}" = "true" ]; then
  echo "Running initial backup on start..." >>"$LOG"
  # shellcheck disable=SC1090
  ( . "$ENV_FILE"; cd /app && tsx scripts/backup-database.ts ) >>"$LOG" 2>&1 \
    || echo "Initial backup failed (see above)." >>"$LOG"
fi

echo "Backup scheduler started with cron: $CRON"
if [ -n "$VERIFY_CRON" ] && [ "$VERIFY_CRON" != "off" ]; then
  echo "Restore verification scheduled with cron: $VERIFY_CRON"
else
  echo "Restore verification disabled (RESTORE_VERIFY_CRON=off)."
fi

# Stream job output to stdout, then run cron in the foreground as PID 1's child.
tail -F "$LOG" &
exec crond -f -l 8
