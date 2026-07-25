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

- [ ] Stripe webhook endpoint created in our own Stripe account and verified
      (see [`SUBSCRIPTION_WEBHOOKS.md`](SUBSCRIPTION_WEBHOOKS.md#taking-over-from-ghost)).
- [ ] Existing subscriptions backfilled and matched to members by
      `stripeCustomerID` / `stripeSubscriptionID`.
- [ ] Stripe's active subscriptions reconciled against the members the export
      marked as paying; every difference explained **before** Ghost is cancelled.
- [ ] Only then: remove Ghost's Stripe connection.
