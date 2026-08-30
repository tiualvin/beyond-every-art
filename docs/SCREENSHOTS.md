# Taking screenshots

`pnpm screenshot <url> [output.png]` launches headless Chromium (via
Playwright) and saves a full-page PNG. Use it for visual QA against staging or
production — the before/after comparisons in
[`docs/assets/frontend-fixes`](assets/frontend-fixes) were made this way.

```
pnpm screenshot https://staging.beyondeveryart.com
pnpm screenshot https://staging.beyondeveryart.com homepage.png
pnpm screenshot https://staging.beyondeveryart.com mobile.png --viewport=390x844
pnpm screenshot https://staging.beyondeveryart.com above-fold.png --no-full-page
```

With no output path given, it saves a timestamped file under `screenshots/`
(gitignored).

## Why it scrolls before capturing

The homepage lazy-loads images and topic-fill sections as they enter the
viewport. Capturing immediately after `load` reliably misses everything below
the fold. The script scrolls to the bottom, waits for network idle and for
every `<img>` to finish loading, scrolls back to the top, and only then
captures full-page — see `scripts/screenshot.ts`.

## Running in the Claude Code sandbox

The Claude Code web/remote sandbox routes outbound HTTPS through an agent
proxy (`HTTPS_PROXY`) that tunnels TLS over a WebSocket relay to an egress
proxy. That relay resets Chromium's connections mid-handshake — plain `curl`
and TLS 1.2 both go through fine, but Chromium's TLS 1.3 handshake (early
data / 0-RTT) does not survive the tunnel. When `HTTPS_PROXY` is set, the
script disables TLS 1.3 early data and caps Chromium at TLS 1.2, which is the
workaround that fixed it. Outside that sandbox (a laptop, CI) it launches
with no special flags.

If screenshots start failing again with `net::ERR_CONNECTION_RESET`, check
`curl -sS "$HTTPS_PROXY/__agentproxy/status"` before assuming the workaround
has stopped working — `recentRelayFailures` names the affected host and
reason.
