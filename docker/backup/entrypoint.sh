#!/bin/sh
# Entrypoint for the backup container. Installs a cron schedule that runs the
# database backup script, and streams its output to the container log so
# `docker compose logs backup` shows each run.
#
# Environment:
#   BACKUP_CRON      cron schedule (default: 0 3 * * *, i.e. 03:00 daily)
#   BACKUP_ON_START  run one backup immediately on container start (default false)
# plus the DATABASE_URI / S3_* / BACKUP_* variables read by backup-database.ts.
set -eu

CRON="${BACKUP_CRON:-0 3 * * *}"
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
echo "$CRON . $ENV_FILE; cd /app && tsx scripts/backup-database.ts >> $LOG 2>&1" \
  >/etc/crontabs/root

if [ "${BACKUP_ON_START:-false}" = "true" ]; then
  echo "Running initial backup on start..." >>"$LOG"
  # shellcheck disable=SC1090
  ( . "$ENV_FILE"; cd /app && tsx scripts/backup-database.ts ) >>"$LOG" 2>&1 \
    || echo "Initial backup failed (see above)." >>"$LOG"
fi

echo "Backup scheduler started with cron: $CRON"

# Stream job output to stdout, then run cron in the foreground as PID 1's child.
tail -F "$LOG" &
exec crond -f -l 8
