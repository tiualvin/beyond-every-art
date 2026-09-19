# Analytics

How the site loads an analytics tag, how to choose between the two supported
ways, and what a Content-Security-Policy costs a Tag Manager container.

Capturing the pre-cutover baseline is a separate job:
[`SEO_BASELINE_CAPTURE.md`](SEO_BASELINE_CAPTURE.md).

## Two ways in, and you pick one

| Variable             | Loads                   | Use it when                            |
| -------------------- | ----------------------- | -------------------------------------- |
| `NEXT_PUBLIC_GTM_ID` | A Tag Manager container | The container fires more than just GA4 |
| `NEXT_PUBLIC_GA_ID`  | The GA4 tag, directly   | GA4 is the only thing you run          |

`lib/analytics/tag.ts` decides which renders. Both are gated on the deployment
being indexable, so neither fires on staging.

**Never both, pointing at the same property.** A container almost always fires
GA4 itself, so loading the direct tag alongside it sends every `page_view`
twice. GA4 has no way to separate doubled hits after the fact — you cannot fix
it later, you can only stop it and lose the period. If both variables are set
the container wins, because that is the reading that cannot double-count: at
worst it loads a container that fires nothing.

A malformed id renders nothing rather than a broken tag, and does not fall
through to the other variable. A missing tag is at least visible in Realtime; a
tag pointing at nothing looks exactly like a working one.

## The noindex gate

```ts
// lib/analytics/tag.ts
if (isNoindex(env)) return null
```

`NEXT_PUBLIC_NOINDEX` is the marker for "this is not the real site", and search
engines and analytics obey it together. That coupling is deliberate: one switch
means the two cannot drift apart, so a staging deployment holding the
production id still reports nothing.

The failure it prevents is the one with no undo. If analytics had its own
separate switch, then staging quietly reporting into the production property
would mix test traffic into real traffic past the point where anything can
separate them. Losing a few days of staging data is free; polluting a property
is not.

The consequence to plan around: **you cannot rehearse analytics on staging.**
Verify at the flip instead — unset `NEXT_PUBLIC_NOINDEX`, load the site, and
watch GA4 **Reports → Realtime**. If nothing appears the fix is one line in
`.env` plus a restart, so the exposure is minutes.

Do not lift `noindex` on staging to test a tag. It is the only thing keeping a
complete duplicate of the site out of the index, and a crawler does not need
long.

## Consent, and what governs the tag

The site runs Google's Privacy & messaging CMP, configured in the AdSense
console. The AdSense tag serves the banner itself, which is why it needed no
code here — and why, for a while, it governed the ad tag and nothing else. A
Google tag with **no declared consent default treats consent as granted**, so
GA4 set cookies on every EEA and UK visit from page load until the banner's
answer arrived, if it arrived at all. A banner that governs half the tags on a
page is worse than no banner, because it has made a claim.

`lib/analytics/consent.ts` declares the default. Two commands:

```js
gtag('consent', 'default', { …: 'granted' })
gtag('consent', 'default', { …: 'denied', region: [/* EEA, GB, CH */], wait_for_update: 500 })
```

Granted where no banner is shown, denied where one is. Order does not decide
which applies — Google resolves the overlap by specificity, so the regional
command governs the countries it names and the unscoped one governs the rest.

**Denying everywhere would be denying forever.** Google's CMP shows nothing
outside those countries, so nothing would ever update the signal for anybody
else and analytics would go cookieless worldwide while looking configured.
`NEXT_PUBLIC_CONSENT_SCOPE=all` does it anyway for the day a banner runs
worldwide; anything unrecognised falls back to the regional pair, because a
typo must not turn analytics off for the whole world.

`wait_for_update: 500` is on the denied command only. It is a real cost on
every restricted-region page view, and the alternative is a tag firing — and
writing a cookie — in the gap between the page loading and the banner being
answered, which is the gap the whole thing exists to close.

### Where the script goes, and why that took measuring

The default has to be on `dataLayer` before a tag acts on it, and two plausible
placements do not do what their names suggest. Both were tried against a built
server rather than reasoned about:

| Placement                                    | What actually happened                     |
| -------------------------------------------- | ------------------------------------------ |
| `next/script` `strategy="beforeInteractive"` | Rendered into `<body>`, after both loaders |
| An explicit `<head>` in the layout           | Lands in `<head>` — this is what ships     |

`beforeInteractive` is reserved for the literal `app/layout.tsx`, and this
application's root layout is `app/(frontend)/layout.tsx` — a root layout for
its route group, which is not the same thing.

Even in `<head>` it is third, not first: React 19 hoists the AdSense loader and
the analytics loader above it, because both are `<script async src>`. That is
in time for two independent reasons. Both loaders are `async`, so neither
executes during parsing while this one does. And neither reads consent when it
loads — GA4 acts on `gtag('config', …)` and AdSense on `adsbygoogle.push({})`,
both strictly later.

Measured in Chromium against a production build, `dataLayer` comes out as:

```
set ads_data_redaction → consent default → consent default → js → config
```

The defaults ahead of the command that sends the first hit.
[`../e2e/analytics-consent.spec.ts`](../e2e/analytics-consent.spec.ts) pins
that order, because the second reason is a fact about today's tags rather than
a guarantee: **a Tag Manager container fires on load**, so configuring
`NEXT_PUBLIC_GTM_ID` is exactly the change that would make the ordering matter
for real.

### What is still not gated

Nothing reads the signals back. Both Google tags honour them on their own, and
nothing else on the page sets a non-essential cookie, so there is no consumer
to write. A reader belongs in `lib/analytics/consent.ts` when something
non-Google needs one — not before, or it is an abstraction with one imaginary
caller.

The script is inline, so `'unsafe-inline'` in `script-src` is what lets it run.
[`CONTENT_SECURITY_POLICY.md`](CONTENT_SECURITY_POLICY.md) phase 3 replaces
that with nonces, and this is one of the scripts to check when it happens: a
consent default that silently fails to run looks exactly like never having had
one.

## Neither is a build argument

Both are read at **runtime**. Set one in `.env`, restart, done — no rebuild.

That is not true of every `NEXT_PUBLIC_*` variable here, and the difference is
worth understanding because it gets decided wrongly by name.
`app/(frontend)/layout.tsx` is a server component, so its reads survive into
the server build and the value reaches the browser as a prop. By contrast
`NEXT_PUBLIC_CHECKOUT_URL_MONTHLY` is read in `lib/membership.ts`, which
`app/(frontend)/components/site-chrome.tsx` imports — a client component — so
Next replaces that read at build time and it must be passed as a Docker build
argument.

**A `NEXT_PUBLIC_*` value needs a build argument when it can reach the client
bundle, not because of its name.** Both were checked against build output
rather than reasoned about.

## What is deliberately missing from the container snippet

Google's published snippet has a second half:

```html
<noscript
  ><iframe
    src="https://www.googletagmanager.com/ns.html?id=GTM-XXXXXXX"
  ></iframe
></noscript>
```

This site does not render it. It serves only visitors with JavaScript disabled,
for whom a container can fire almost nothing anyway, and including it would mean
widening `frame-src` in the CSP for that sliver. If you find you need it — a
server-side tagging setup, or a specific tag that depends on it — it is a small
addition alongside a `frame-src` entry.

## A container and a CSP are in tension

This is the part worth reading before adding tags.

A container's purpose is firing third-party tags chosen in a web interface, long
after the policy was written. The CSP enumerates origins the browser may load
from. So **every tag you add is a potential violation**, and under enforcement a
violation is a tag that silently does not run.

Google's own origins are covered automatically whenever either variable is set —
`googletagmanager.com` for the script, the GA4 collectors for the beacons.
Everything else needs adding:

```bash
CSP_SCRIPT_SRC=https://connect.facebook.net https://static.hotjar.com
CSP_CONNECT_SRC=https://api.hotjar.io
CSP_IMG_SRC=https://www.facebook.com
CSP_FRAME_SRC=https://vars.hotjar.com
```

Space- or comma-separated, same parser for all four.

**Fill them from the reports, not from guesswork.** The policy ships in
report-only mode by default: the browser reports what it _would_ have blocked
and blocks nothing, and each report names the exact origin the blocked request
wanted. Add a tag, load the site, read `/csp-report/` output, add the origin.
See [`CONTENT_SECURITY_POLICY.md`](CONTENT_SECURITY_POLICY.md).

Two things that will not be solved by adding an origin:

- **Custom HTML tags** in a container can need `'unsafe-eval'`, which the policy
  does not grant outside development. Prefer a built-in tag template where one
  exists.
- **Tag Manager's own Preview mode** opens a debug connection that the policy
  may block. Report-only mode is the sane place to do container work.

The honest summary: a container and a strict CSP both want to be the thing that
decides what runs on the page. Keeping the policy in report-only while you build
out the container, then enforcing once the origin list has stopped growing, is
the order that works.
