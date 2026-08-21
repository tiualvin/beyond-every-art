#!/bin/sh
# Entrypoint for the billing reconciliation container. Installs a cron schedule
# that runs `reconcile:billing`, and streams its output to the container log so
# `docker compose logs reconcile` shows each run.
#
# Why this exists: webhooks are an optimisation over polling, not a guarantee.
# Anything Stripe delivered while the app was down, or delivered and we failed
# to store, is invisible until something reads the current state back. Once
# Ghost is switched off nothing else is listening, so this sweep is the only
# thing standing between a failed renewal and a member who keeps their access
# for months — or loses it while still paying. The cutover runbook requires it
# to be scheduled before Ghost's Stripe connection is removed.
#
# It runs from the migrator image rather than the backup one: the script reaches
# Payload through the Local API, so it needs the application's dependency tree,
# which the deliberately tiny backup image does not carry.
#
# Environment:
#   RECONCILE_CRON     cron schedule (default: 0 4 * * *, an hour after backups)
#   RECONCILE_ON_START run one sweep immediately on container start (default false)
#   STRIPE_SECRET_KEY  required; without it nothing is scheduled (see below)
# plus the DATABASE_URI / PAYLOAD_SECRET variables the script reads through Payload.
set -eu

LOG=/var/log/reconcile.log
ENV_FILE=/app/.reconcile-env
CRON="${RECONCILE_CRON:-0 4 * * *}"

# Stripe is taken over during the cutover, not before it, so this container
# exists before the key it needs does. Scheduling anyway would fail every night
# until then, and an alert that is always red is one nobody reads. Stay up and
# say why instead: `docker compose ps` showing this container running, with one
# line in its log naming the missing variable, is a more honest picture of an
# unfinished cutover step than a container that is not there at all.
if [ -z "${STRIPE_SECRET_KEY:-}" ]; then
  echo "{\"level\":\"warn\",\"event\":\"reconcile_not_scheduled\",\"time\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"reason\":\"STRIPE_SECRET_KEY is not set\"}"
  echo "Billing reconciliation is not scheduled: STRIPE_SECRET_KEY is not set."
  echo "See the Stripe takeover checklist in docs/CUTOVER_RUNBOOK.md."
  # Idle rather than exit: exiting under `restart: unless-stopped` is a restart
  # loop, and a loop is noise rather than a signal. `exec` so this is still PID
  # 1 and `docker compose stop` is immediate rather than a ten-second wait.
  exec tail -f /dev/null
fi

touch "$LOG"
tail -F "$LOG" &

# busybox crond runs jobs with a minimal environment, so persist the current
# runtime environment for the cron job to source. Values here are connection
# strings and keys with no embedded newlines.
printenv | sed 's/^\([^=]*\)=\(.*\)$/export \1="\2"/' >"$ENV_FILE"
# It holds the live Stripe secret key, so it is readable by root and nobody else.
chmod 600 "$ENV_FILE"

# The script exits non-zero when Stripe and our records disagree, which is the
# entire point of running it — so the wrapper turns that into one JSON line
# beside the app's own `webhook_rejected` and `webhook_unresolved` lines, where
# the same log collector can alert on it. No member data goes into the line; the
# detail is in the report the script writes.
cat <<'RUN' | sed "s#__ENV_FILE__#$ENV_FILE#" >/usr/local/bin/run-reconcile
#!/bin/sh
set -u
. __ENV_FILE__
cd /app
now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
if pnpm --silent reconcile:billing --report /tmp/reconciliation-report.json; then
  echo "{\"level\":\"info\",\"event\":\"reconcile_ok\",\"time\":\"$(now)\"}"
else
  status=$?
  echo "{\"level\":\"error\",\"event\":\"reconcile_failed\",\"time\":\"$(now)\",\"exitCode\":$status}"
fi
RUN
chmod +x /usr/local/bin/run-reconcile

mkdir -p /etc/crontabs
echo "$CRON /usr/local/bin/run-reconcile >> $LOG 2>&1" >/etc/crontabs/root

if [ "${RECONCILE_ON_START:-false}" = "true" ]; then
  echo "Running an initial reconciliation on start..." >>"$LOG"
  /usr/local/bin/run-reconcile >>"$LOG" 2>&1 || true
fi

echo "Reconciliation scheduler started with cron: $CRON"

exec crond -f -l 8
