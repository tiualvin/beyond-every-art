# Cutover Day

The ordered sheet for the morning of the flip. It is a narrowing of
[`CUTOVER_RUNBOOK.md`](CUTOVER_RUNBOOK.md) down to what this cutover actually
does, in the order it does it. The runbook stays the reference for why each step
exists and for everything this one leaves out; where they disagree, the runbook
is right and this file is stale.

**This cutover runs no migration.** That is the single biggest difference from
the runbook's Cutover section and it is deliberate — see "What is deliberately
not run" at the end before doing anything that looks like an import.

> [!NOTE]
> **Done on 19 Sep 2026.** The site is live on Payload; Ghost is still running
> as the rollback. What follows is now the record of what was run, corrected
> where the first version of it was wrong — three commands and one ordering.
> Read the corrections before trusting any earlier copy of this file.

---

## A. Clear these before the flip

**A2, A3 and A4 were done on 18 Sep.** Only A1 is left, and it is the gate on
starting.

### A1. Get the cutover gate green — required, not yet done

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

### A2. Re-upload media id 4 — done 18 Sep

Re-uploaded through the Payload admin as
`photo-1689659721022-3aa475803e19.jpeg`. The site's only broken image, and the
filename mattered as much as the bytes: the old one had no extension, which
`trailingSlash` made unreachable.

Recorded because `pnpm restore:media` looks like the tool for this and is not —
it sets `overwriteExistingFiles: true` specifically to preserve the existing
filename, so it would have restored the bytes under the unreachable name. If
this ever recurs, it is the admin again.

### A3. Take the Ghost members export — done 18 Sep

Taken and held off-server. The Payload import stays skipped — Klaviyo is the
ESP, see [`EMAIL.md`](EMAIL.md) — but this file is the only copy of the member
list that survives cancelling Ghost, and it could not have been recovered
afterwards. Load it into Klaviyo when the newsletter is built.

### A4. Freeze publishing in Ghost — done 18 Sep

Editors told. The freeze landing **before** the A1 export rather than after is
the safe order: the export tomorrow is then a complete picture, with nothing
published into the gap between the two.

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
  https://www.beyondeveryart.com/health/
```

Expect `{"status":"ok","db":"up"}`. From the VPS itself, since ports 80 and 443
admit only Cloudflare from outside.

**The trailing slash is required.** `next.config.ts` sets `trailingSlash: true`,
so `/health` answers 308 with the body `/health/` — which reads like a failure
and is not.

### 3. Move DNS — Cloudflare

**This comes before the redirect validation, not after.** The first version of
this sheet copied the runbook's order and had them the other way round, which
cannot work: `validate:redirects` takes `--target https://www.beyondeveryart.com`
and resolves it normally, with no host or DNS override among its flags. Run
before the DNS edit and it tests Ghost, which passes its own redirects happily
and tells you nothing about this site.

**Write the current records down first.** Rollback is a DNS change back to
Ghost, and the edit overwrites the only copy of what Ghost's records were. A
Cloudflare zone export is worth taking too, but it is not sufficient on its own:
the BIND format has no way to express proxy status, and proxy status is exactly
what decides whether a reverted site works.

```
ROLLBACK — Ghost Pro, as recorded 19 Sep 2026
  beyondeveryart.com   A      178.128.137.126             DNS only (grey)
  www                  CNAME  beyond-every-art.ghost.io   DNS only (grey)
```

Both **grey**. Ghost Pro terminates its own TLS at Fastly and will not work
behind Cloudflare's proxy, so a rollback that restores these orange is still a
broken site. Ghost itself is untouched by any of this, so rollback is purely
recreating these two rows: what they arrange is that a request for
`www.beyondeveryart.com` reaches Ghost's edge, which serves the site for that
hostname.

**Not at its own hostname — corrected 22 Sep.** This sheet first said Ghost
"keeps serving at `beyond-every-art.ghost.io` whatever DNS says". It does not.
With a custom domain set, Ghost(Pro) answers every public path there with a
`302` to `https://www.beyondeveryart.com/<same path>` — which is this site now —
and only `/ghost/`, the admin, answers `200`. So the old site cannot be browsed
or crawled at that hostname, and the production crawl comparison replays the
rehearsal's crawl of Ghost instead
([`MIGRATION_REHEARSAL.md`](MIGRATION_REHEARSAL.md) §6, "The production run").
Whether the rollback still works is a question about the hostname Ghost is
asked for, not the one it lives at, and it has not been re-checked since the
flip. From any machine:

```bash
curl -sI --connect-to www.beyondeveryart.com:443:beyond-every-art.ghost.io:443 \
  https://www.beyondeveryart.com/
```

A `200` with no `cf-ray` header is Ghost answering for the domain, which is
what the two rows above rely on.

Two zone settings to confirm **before** editing anything:

- **SSL/TLS → Overview must be `Full (strict)`.** Zone-wide, and already correct
  from the staging work on 29 Aug. On `Flexible` Cloudflare sends plain HTTP to
  the origin, Caddy 301s it back to HTTPS, and the live site becomes an infinite
  redirect loop the moment these records go orange.
- **Scrape Shield → Email Address Obfuscation must be off.** Switched off
  zone-wide on 18 Sep. Back on, it rewrites every `mailto:` into
  `/cdn-cgi/l/email-protection` and poisons the next crawl comparison — that was
  126 of the first comparison run's 135 errors.

Then the edits. TTLs are already 300s.

1. **apex** `beyondeveryart.com` → `A 178.104.16.54`, **Proxied**
2. **`www`** → `A 178.104.16.54`, **Proxied**
3. **Delete** the `staging` record
4. **Leave `cms` alone**

`www` was a `CNAME` to Ghost, so it is a delete-then-create rather than an edit:
Cloudflare will not hold a CNAME and an A record on the same name.

Proxied, not grey: the origin admits only Cloudflare on 80 and 443, so an
unproxied record is a site that times out.

Afterwards, **Caching → Configuration → Purge Everything**. One click, and it
removes the whole class of "why am I still seeing the old site" before it can
cost twenty minutes.

**Verify from a laptop, never from the VPS.** The box caches the pre-proxy
address in its own resolver and keeps answering itself directly long after the
toggle took effect, which reads exactly like a toggle that did not work.

```bash
NS=$(dig +short NS beyondeveryart.com | head -1)
dig +short www.beyondeveryart.com @"$NS"      # authoritative, bypasses caches
curl -sSI https://www.beyondeveryart.com/ | grep -iE '^HTTP|cf-ray|^server'
curl -sSI https://beyondeveryart.com/ | grep -iE '^HTTP|^location'
curl -sS  https://www.beyondeveryart.com/robots.txt
```

A proxied record returns Cloudflare's edge IPs (`104.x`, `172.67.x`) and
**never** `178.104.16.54` — hiding the origin is the point of the orange cloud,
so do not go looking for the VPS address and conclude it failed. Want `cf-ray`
with `server: cloudflare`, the apex 301ing to `www`, and a `robots.txt` that
emits `Sitemap:` and `Host:` and disallows `/admin` and `/api`.

That `robots.txt` is also the cleanest proof you are on the new site: Ghost
disallows `/ghost/` and `/p/` and never emits a `Host:` line.

### 4. Validate the redirects

Not a spot-check. This is the one part of the migration whose failure is silent:
a broken rule looks exactly like a URL nobody has asked for yet.

Give the VPS five minutes from the DNS edit first — its resolver cached the
Ghost address, and that exact trap already cost a wasted crawl on this box once.

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
checked against URLs that do not exist.

**Two errors on `/ads.txt` are expected and are not a failure.** Both were seen
on 19 Sep and both are the validator correctly reporting a deliberate design
change it does not know about (29 Aug, `docs/ADVERTISING.md` §1):

- _"the middleware matcher skips this path, so the rule can never run"_ —
  correct. `middleware.ts` excludes any path containing a dot, so an `/ads.txt`
  row imports cleanly, looks configured, and never runs. `migrate:redirects`
  reports the same thing as non-fatal.
- _"answered 200, expected 301"_ — the 200 **is** the fix. Caddy serves
  `/ads.txt` from the repository-root file bind-mounted at `/srv/ads.txt`,
  replacing Ghost's redirect.

So the script exits non-zero on a run that passed. Check the file is really
being served rather than trusting the exit code either way:

```bash
curl -sS https://www.beyondeveryart.com/ads.txt
```

Any error naming a path other than `/ads.txt` is real: fix and redeploy, or
revert DNS if it is bad enough.

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
`/sitemap.xml`, `/rss`, `/robots.txt`, `/health/`. `robots.txt` should now emit
`sitemap` and `host` and disallow `/admin` and `/api` — if it still says
`Disallow: /`, `NEXT_PUBLIC_NOINDEX` is still set somewhere.

---

## C. Immediately after

- [ ] A fresh backup of the state the site launched on — see below.
- [ ] Confirm HTTPS is valid in a browser, on both the apex and `www`.
- [ ] Submit the sitemap in Google Search Console.
- [ ] GA4 → **Reports → Realtime**, within seconds of loading the site. This is
      the first moment the tag can be verified at all, because the `noindex`
      gate kept it off on staging.
- [ ] Check the CSP report endpoint for violations the container trips.
- [ ] **Leave Ghost running.** Rollback is a DNS change back to Ghost, and that
      only works while Ghost is still there.

---

### The backup command, which is not the obvious one

**Not `pnpm backup:db` in `migrate`.** `pg_dump` lives in the `backup` image
(`postgresql16-client`) and not in `migrate`, so that fails with
`spawn pg_dump ENOENT`. The backup image's entrypoint is a cron scheduler that
ignores anything after the image name, so `--entrypoint tsx` is required rather
than decoration — without it this silently starts the nightly scheduler in the
foreground and backs nothing up.

```bash
docker compose run --rm --entrypoint tsx backup scripts/backup-database.ts
```

Want `"uploaded": true`, `"encrypted": true`, `"errors": []`. It ran clean on
19 Sep at 2.3 MB, which is the first proof that this bucket, these credentials
and the passphrase in the production `.env` work together — something the CI
restore drill deliberately cannot establish.

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
- Stripe, before **cancelling** Ghost rather than before the flip. While the
  account is still zero customers and zero subscriptions, that is only
  confirming so, deleting Ghost's endpoint and disconnecting Stripe in Ghost
  Admin; the full handover is due before the checkout links are set. See
  [`CUTOVER_RUNBOOK.md`](CUTOVER_RUNBOOK.md#when-it-is-due), and use
  `invoice.paid` rather than `invoice.payment_succeeded` when it comes.
- Administrator password reset does not send mail, by decision. Recovery is
  `docker compose run --rm migrate pnpm bootstrap:admin` over SSH. See
  [`EMAIL.md`](EMAIL.md).
- The box wants a reboot: 37 updates, 18 of them ESM security. Not today.
