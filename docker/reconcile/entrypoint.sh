#!/bin/sh
# Entrypoint for the billing reconciliation container. Installs a cron schedule
# that runs `reconcile:billing` against Stripe, and streams its output to the
# container log so `docker compose logs reconcile` shows each run.
#
# Environment:
#   RECONCILE_CRON  cron schedule (default: 30 2 * * *, i.e. 02:30 daily)
#   STRIPE_SECRET_KEY  required; the container refuses to start without it
# plus the DATABASE_URI / PAYLOAD_SECRET / STRIPE_* variables the script reads.
#
# Why this exists. Webhooks are an optimisation over polling, not a guarantee:
# anything Stripe delivered while the app was down, or to an endpoint that was
# briefly misconfigured, is lost and nothing notices. `reconcile:billing`
# re-reads every access-granting subscription from Stripe and compares it with
# what the members collection says, so a drift shows up the next morning instead
# of during a billing dispute. docs/CUTOVER_RUNBOOK.md requires this to be
# scheduled with alerting on a non-zero exit before Ghost is cancelled — the
# script exits non-zero on any unexplained difference, which is what makes the
# alert possible.
#
# It runs in the migrator image rather than the backup one because the script
# boots Payload: it needs the full dependency tree and payload.config.ts, and
# the backup image deliberately carries neither.
set -eu

CRON="${RECONCILE_CRON:-30 2 * * *}"
LOG=/var/log/reconcile.log
ENV_FILE=/app/.reconcile-env

# Fail at startup rather than at 02:30. This service is behind a Compose profile
# that an operator turns on deliberately, so arriving here without a key means
# the profile was enabled before the Stripe takeover in docs/CUTOVER_RUNBOOK.md
# was finished — and a container that exits now says so far more clearly than a
# nightly job failing on a guard inside the script.
if [ -z "${STRIPE_SECRET_KEY:-}" ]; then
  echo "STRIPE_SECRET_KEY is not set, so there is nothing to reconcile against." >&2
  echo "Set it in .env, or drop the 'reconcile' profile until the Stripe" >&2
  echo "takeover in docs/CUTOVER_RUNBOOK.md is done." >&2
  exit 1
fi

# busybox crond runs jobs with a minimal environment, so persist the current
# runtime environment for the cron job to source. Values here are simple
# connection strings and keys with no embedded newlines.
printenv | sed 's/^\([^=]*\)=\(.*\)$/export \1="\2"/' >"$ENV_FILE"

touch "$LOG"
mkdir -p /etc/crontabs

# No `--dry-run`: the daily sweep is meant to record what Stripe currently says,
# which is what makes a missed webhook recoverable rather than merely visible.
# The run is idempotent — the synthetic event ID carries the subscription's
# status and period end, so a sweep that sees unchanged state writes nothing.
#
# No literal `%` may appear in a job line: cron reads one as a newline and feeds
# the remainder to the job as stdin. Docker timestamps the stream instead
# (`docker compose logs -t reconcile`).
echo "$CRON . $ENV_FILE; cd /app && { echo \"--- billing reconciliation\"; pnpm reconcile:billing || echo \"Billing reconciliation FAILED - Stripe and the member records disagree, or the sweep could not run (see above).\"; } >> $LOG 2>&1" \
  >/etc/crontabs/root

echo "Billing reconciliation scheduled with cron: $CRON"

# Stream job output to stdout, then run cron in the foreground as PID 1's child.
tail -F "$LOG" &
exec crond -f -l 8
