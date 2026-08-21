# Cutover Runbook

The production switch from Ghost to the Payload site. Run this only after a
clean [migration rehearsal](MIGRATION_REHEARSAL.md). Keep Ghost online and
authoritative until the new site is verified in production; do not cancel Ghost
on cutover day.

## Pre-cutover (day before)

- [ ] Rehearsal completed cleanly; all recorded issues resolved.
- [ ] Production stack deployed with real `SITE_ADDRESS`, R2, and email config.
- [ ] `NEXT_PUBLIC_NOINDEX` and `STAGING_BASIC_AUTH` are **unset** in production.
- [ ] `NEXT_PUBLIC_SITE_URL` is the production URL; canonical/sitemap/RSS use it.
- [ ] The `backup` service is running and has produced at least one backup.
- [ ] DNS TTL for the domain reduced (e.g. to 300s) so the flip propagates fast.
- [ ] Administrator account exists in production Payload.

## Cutover

1. **Freeze publishing** in Ghost (tell editors; avoid new posts mid-migration).
2. Create a **final Ghost export** (content, redirects, members).
3. Obtain the **latest members export**.
4. Download **media added since the rehearsal**.
5. Run the **final migration** against production:

   ```bash
   pnpm migrate:ghost      --input ghost-export/ghost-content.json
   pnpm migrate:redirects  --input ghost-export/redirects.json
   pnpm migrate:members    --input ghost-export/ghost-members.csv
   ```

6. **Validate** the production import:

   ```bash
   pnpm migrate:validate --input ghost-export/ghost-content.json
   ```

   Do not proceed unless it reports `"ok": true`.

7. Spot-check: content counts, several recent posts, the homepage, media,
   a handful of redirects, `/sitemap.xml`, `/rss`, `/robots.txt`, `/health`.
8. **Change DNS** to the new server. Watch propagation.
9. Monitor logs and error output (`docker compose logs -f app caddy`) and the
   `request_error` (500) and `not_found` (404) JSON log lines emitted by the
   app. Filter them with, for example,
   `docker compose logs app | grep '"event":"not_found"'`.
10. Keep **Ghost active as a fallback**. Do not cancel it yet.

## Immediately after cutover

- [ ] Take a fresh backup: `pnpm backup:db`.
- [ ] Confirm HTTPS is valid (Caddy provisioned the certificate).
- [ ] Submit the new sitemap in Google Search Console.
- [ ] Confirm analytics is receiving traffic (`NEXT_PUBLIC_GA_ID`).
- [ ] Verify a password-reset email is delivered.

## Post-launch monitoring (first weeks)

Watch, via logs / Search Console / uptime monitor / `/health`:

- 404 errors (`not_found` log lines; add redirects for any important misses)
- 500 errors (`request_error` log lines)
- Missing images / broken links
- Search Console coverage and sitemap processing
- Canonical URL issues
- Analytics traffic vs. the pre-migration baseline
- Form submissions and email delivery
- Database storage, R2 usage, CPU/memory
- Nightly backup completion (`docker compose logs backup`)
- Rejected or unresolved billing webhooks (`webhook_rejected`,
  `webhook_unresolved` log lines), once the Stripe takeover below is live
- The nightly reconciliation's verdict (`reconcile_failed` log lines), which is
  what notices a subscription change no webhook ever delivered

## Rollback

Because Ghost stays online and authoritative until sign-off, rollback is a DNS
change back to Ghost. The new site's own data is protected by the backup
pipeline ([`BACKUP_AND_RESTORE.md`](BACKUP_AND_RESTORE.md)).

## Decommissioning Ghost

Only after the new site has run cleanly in production, the crawl comparison is
verified, backups have been tested, and the acceptance criteria in the handoff
doc are met. Retain a final Ghost export and database backup off-site first.

### Paid subscriptions in Stripe

Existing website subscriptions keep billing in Stripe after Ghost is gone, but
Ghost is what has been listening for renewals, cancellations, and failed
payments. Nothing takes over automatically, so subscription state silently stops
tracking reality from the moment Ghost is switched off.

The endpoint and the reconciliation script exist (`POST /webhooks/stripe` and
`pnpm reconcile:billing`); what follows is the operational handover. Work
through it **before** cancelling Ghost — a difference found afterwards cannot be
explained without a manual Stripe audit.

- [ ] `STRIPE_WEBHOOK_SECRET` and `STRIPE_SECRET_KEY` set in the production
      environment file. Without the first, the endpoint refuses every request;
      without the second, events are stored but their current state is read only
      by the reconciliation sweep.
- [ ] Webhook endpoint created in **our** Stripe account, pointing at
      `https://<domain>/webhooks/stripe`, subscribed to the events listed in
      [`SUBSCRIPTION_WEBHOOKS.md`](SUBSCRIPTION_WEBHOOKS.md#stripe-website).
- [ ] Endpoint subscribed to `invoice.paid` — **not** `invoice.payment_succeeded`,
      which is what Ghost's endpoint uses. They are different event types and the
      wrong one fails silently: renewals get stored and marked `ignored`
      (`unhandled_type`) while no subscription state ever changes. Ghost's
      selection also omits `invoice.payment_failed` and `charge.dispute.created`.
      Do not copy Ghost's list.
- [ ] Endpoint verified end to end: send a test event from the Stripe dashboard
      (or `stripe trigger` via the CLI), confirm a `2xx` in Stripe's delivery
      log and a matching row in the `billing-events` collection.
      The endpoint must be publicly reachable over HTTPS. `STAGING_BASIC_AUTH`
      does _not_ block it — that gate lives in `middleware.ts`, whose matcher
      excludes `webhooks` — so a staging host can receive real deliveries. That
      is the reason to be careful rather than relaxed: point a live endpoint at
      staging and live billing events land in the rehearsal database. Verify
      against a sandbox endpoint, or after cutover, not against live-on-staging.
- [ ] Checkout links present **at image build time**, not merely in `.env`.
      `NEXT_PUBLIC_CHECKOUT_URL_MONTHLY` / `_YEARLY` are substituted into the
      client bundle by `pnpm build`; docker-compose.yml passes them as build
      arguments, so the deploy must run `docker compose up -d --build`. Setting
      them and only restarting leaves the subscribe modal saying "paid
      membership is not open yet" on a correctly configured host, with nothing
      in the logs to say why.
- [ ] Backfill dry run, via the `migrate` service:
      `docker compose run --rm migrate pnpm reconcile:billing --dry-run`.
      It lists Stripe's active, trialing, and past-due subscriptions and matches
      them to members by `stripeCustomerID` / `stripeSubscriptionID`.
      Run it through the `migrate` service rather than on the host: the script
      loads nothing from `.env` by itself (no dotenv anywhere in `scripts/`), and
      that service is the one image carrying tsx, the sources, and `env_file`.
      Running `pnpm reconcile:billing` directly on the VPS fails on the missing
      `STRIPE_SECRET_KEY` guard. Locally, `set -a; source .env; set +a` first.
- [ ] Every difference in that report explained (`differences` is empty, or each
      entry has a written answer). It exits non-zero while any remain.
- [ ] Backfill for real: `docker compose run --rm migrate pnpm reconcile:billing`,
      which records what Stripe currently says for each subscription. As of
      2026-08-18 the live account has no subscriptions at all, so expect an empty
      report and treat anything else as a surprise worth understanding.
- [ ] Daily reconciliation confirmed running. The `reconcile` service schedules
      it (`RECONCILE_CRON`, 04:00 by default), but it stays inert until
      `STRIPE_SECRET_KEY` is set — so restart it after writing the key and check
      that its log says it scheduled rather than that it skipped:
      `docker compose logs reconcile | tail`. Each run emits one JSON line,
      `reconcile_ok` or `reconcile_failed`; alert on the second, the same way
      the app's `webhook_rejected` lines are watched. Webhooks are an
      optimisation over polling, not a guarantee.
- [ ] Only then: remove Ghost's Stripe connection.

Watch the app logs for `webhook_rejected` and `webhook_unresolved` JSON lines in
the days around the switch:
`docker compose logs app | grep '"event":"webhook_'`.

And the sweep's own verdict, which is the one that catches what the webhooks
missed rather than what they rejected:
`docker compose logs reconcile | grep '"event":"reconcile_'`.
