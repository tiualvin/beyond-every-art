# Cutover Day

The ordered sheet for the morning of the flip. It is a narrowing of
[`CUTOVER_RUNBOOK.md`](CUTOVER_RUNBOOK.md) down to what this cutover actually
does, in the order it does it. The runbook stays the reference for why each step
exists and for everything this one leaves out; where they disagree, the runbook
is right and this file is stale.

**This cutover runs no migration.** That is the single biggest difference from
the runbook's Cutover section and it is deliberate — see "What is deliberately
not run" at the end before doing anything that looks like an import.

---

## A. Clear these before the flip

Four things, and only the first is a gate on starting. The members export is not
a gate on the flip but is a gate on ever cancelling Ghost, and it is the one
with no second chance.

### A1. Get the cutover gate green — required

The export on the VPS is still the 9 Aug one, so it lists four drafts that were
deleted on 18 Sep in both Payload and Ghost. `migrate:validate` builds what it
expects from that file, does not find them, and reports them `missing` with
`ok: false`. Take a fresh content export from Ghost admin, then:

```bash
cd ~/beyond-every-art
cp ghost-export/ghost-content.json \
   ghost-export/ghost-content.2026-08-09.json   # keep the 9 Aug one
# put the newly downloaded export in place as ghost-content.json

docker compose run --rm \
  -v "$PWD/ghost-export:/app/ghost-export:ro" \
  migrate pnpm migrate:validate -- --input ghost-export/ghost-content.json
```

The bind mount is not optional: `ghost-export/` is in `.dockerignore` and the
`migrate` service does not mount it, so without `-v` the container sees no file
at all.

Expect `expected: 113`, `matched: 113` and `ok: true` on `posts`. `actual` of
113 **or 114** both pass — §5 of the rehearsal found one post in Payload that
Ghost never had, and whether it lands in this count depends on whether it
carries a `ghostID`. Anything else, stop and read
[`DEPLOYMENT_STATUS.md`](DEPLOYMENT_STATUS.md) before continuing.

### A2. Re-upload media id 4

The site's only broken image, on a published post. Re-upload it through the
Payload admin as `photo-1689659721022-3aa475803e19.jpeg`, refetching the bytes
from `https://images.unsplash.com/photo-1689659721022-3aa475803e19`.

The filename matters as much as the bytes: the current one has no extension,
which `trailingSlash` makes unreachable. `pnpm restore:media` does **not** do
this — it sets `overwriteExistingFiles: true` specifically to preserve the
existing filename, so it would restore the bytes under the name that is already
unreachable. This one needs the admin.

### A3. Take the Ghost members export

Not needed for the flip, and the Payload import is skipped — Klaviyo is the ESP,
see [`EMAIL.md`](EMAIL.md). Take it anyway and keep it off-server. It is the
only copy of the member list that survives cancelling Ghost, and it cannot be
recovered afterwards.

### A4. Freeze publishing in Ghost

Tell editors. Anything published after the export in A1 is not in Payload and is
lost at the flip.

---

## B. The flip

### 1. Environment, then restart

In `.env` on the VPS:

| Variable               | Set to                           |
| ---------------------- | -------------------------------- |
| `SITE_ADDRESS`         | `www.beyondeveryart.com`         |
| `NEXT_PUBLIC_SITE_URL` | `https://www.beyondeveryart.com` |
| `SITE_REDIRECT_FROM`   | `beyondeveryart.com`             |
| `NEXT_PUBLIC_NOINDEX`  | **unset it** (remove the line)   |
| `STAGING_BASIC_AUTH`   | **unset it**, if still set       |

`SITE_REDIRECT_FROM` is the easy one to miss and the only one that is not about
indexing. Unset, the redirect block in the `Caddyfile` is disabled entirely, so
the apex stops redirecting the moment DNS moves and every typed address and
apex link lands nowhere.

Unsetting `NEXT_PUBLIC_NOINDEX` is also what turns analytics on:
`resolveAnalyticsTag()` returns `null` while the deployment is non-indexable, so
the GTM container starts firing at this step and never on staging.

```bash
docker compose up -d
```

**No rebuild.** These are read at runtime on the server, not substituted into
the client bundle — `docs/ANALYTICS.md` says so for the analytics ids, and the
routes are `force-dynamic`, so `lib/seo/site.ts` and `lib/seo/indexing.ts`
resolve per request. Only `NEXT_PUBLIC_CHECKOUT_URL_MONTHLY` and
`NEXT_PUBLIC_CHECKOUT_URL_YEARLY` are build arguments, and neither changes
today.

### 2. Wait for the certificates — before touching DNS

Both hostnames are new to Caddy this morning: `www.beyondeveryart.com` from
`SITE_ADDRESS` and the apex from `SITE_REDIRECT_FROM`. Because `CADDY_ACME` is
`acme-cloudflare`, they issue over DNS-01, which proves ownership with a TXT
record and therefore works **before** either name points at this VPS. That is
the whole reason this step can happen ahead of the DNS edits.

```bash
docker compose logs caddy | grep -i "certificate obtained"
docker compose exec caddy ls /data/caddy/certificates/*/
```

Both names must appear. The failure here is silent — a missing certificate looks
like a working deployment until DNS moves and the browser refuses the site — so
confirm it rather than assuming it.

While still on the old DNS, the origin can answer for itself:

```bash
curl -sS --resolve www.beyondeveryart.com:443:127.0.0.1 \
  https://www.beyondeveryart.com/health
```

Expect `{"status":"ok","db":"up"}`. From the VPS itself, since ports 80 and 443
admit only Cloudflare from outside.

### 3. Validate the redirects against production

Not a spot-check. This is the one part of the migration whose failure is silent:
a broken rule looks exactly like a URL nobody has asked for yet.

```bash
docker compose run --rm \
  -v "$PWD/ghost-export:/app/ghost-export:ro" \
  migrate pnpm validate:redirects -- \
    --target https://www.beyondeveryart.com \
    --input ghost-export/redirects.json \
    --redirects-map https://cms.beyondeveryart.com/redirects-map/ \
    --tag art --author alvin
```

`--tag` and `--author` must be real values, or the built-in pagination rules are
checked against URLs that do not exist. It exits non-zero on the first failing
rule and reports rules the middleware matcher can never run. Do not move DNS
while it reports errors.

### 4. Move DNS

Three edits in the Cloudflare zone. TTLs are already 300s.

1. `beyondeveryart.com` (apex) → `A 178.104.16.54`, **proxied**
2. `www` → `A 178.104.16.54`, **proxied**
3. Delete the `staging` record

Proxied, not grey-cloud: the origin admits only Cloudflare on 80 and 443, so an
unproxied record is a site that does not answer.

### 5. Watch

```bash
docker compose logs -f app caddy
```

And the app's own structured lines, which are what actually name a problem:

```bash
docker compose logs app | grep '"event":"not_found"'
docker compose logs app | grep '"event":"request_error"'
```

Spot-check by eye while this runs: the homepage, several recent posts, media,
`/sitemap.xml`, `/rss`, `/robots.txt`, `/health`. `robots.txt` should now emit
`sitemap` and `host` and disallow `/admin` and `/api` — if it still says
`Disallow: /`, `NEXT_PUBLIC_NOINDEX` is still set somewhere.

---

## C. Immediately after

- [ ] `pnpm backup:db` — a fresh backup of the state the site launched on.
- [ ] Confirm HTTPS is valid in a browser, on both the apex and `www`.
- [ ] Submit the sitemap in Google Search Console.
- [ ] GA4 → **Reports → Realtime**, within seconds of loading the site. This is
      the first moment the tag can be verified at all, because the `noindex`
      gate kept it off on staging.
- [ ] Check the CSP report endpoint for violations the container trips.
- [ ] **Leave Ghost running.** Rollback is a DNS change back to Ghost, and that
      only works while Ghost is still there.

---

## What is deliberately not run

The runbook's Cutover steps 2, 4 and 5 — `migrate:ghost`, `migrate:redirects`,
`migrate:members`, `repair:content` — **are not run today.**

Payload and the fresh export agree, which is what section A proves. Re-running
`migrate:ghost` would overwrite a repaired database with the unrepaired export:
the importer strips `__GHOST_URL__` placeholders and nothing else, so it would
write back the seven escaped-quote `href`s that 404, and undo the canonical fix
on `fine-art-home-guide`. `repair:content` exists to survive exactly that
import, and with no import there is nothing for it to repair.

If something later makes an import necessary, it is `migrate:ghost` **and**
`repair:content`, in that order, never the first alone.

---

## Still open, and not blocking this flip

- `/about/` may still be missing images the live Ghost page has. The check that
  would have caught it has been unable to fire sitewide since a masthead
  wordmark shipped on 18 Sep; the comparator now counts beneath the chrome and
  warns as `images_reduced`, so the production comparison after the flip will
  answer it. See [`MIGRATION_REHEARSAL.md`](MIGRATION_REHEARSAL.md) §6.
- Stripe handover, before **cancelling** Ghost rather than before the flip.
  Re-check the account is still zero customers and zero subscriptions, and use
  `invoice.paid` rather than `invoice.payment_succeeded`.
- Administrator password reset does not send mail, by decision. Recovery is
  `docker compose run --rm migrate pnpm bootstrap:admin` over SSH. See
  [`EMAIL.md`](EMAIL.md).
- The box wants a reboot: 37 updates, 18 of them ESM security. Not today.
