# Caddy with the Cloudflare DNS module.
#
# IN USE. `docker-compose.yml` builds the `caddy` service from this file, and
# has since #103 — deliberately ahead of anything that needs the module, so
# that turning on Cloudflare's proxy is a config change rather than a build
# problem discovered halfway through a cutover. Read docs/EDGE_PROTECTION.md
# before switching the challenge over.
#
# Why a custom image at all: the site currently proves domain ownership to
# Let's Encrypt over HTTP-01, which requires the challenge to reach this
# server directly. Cloudflare's proxy terminates TLS at their edge, which
# breaks that — and it is the reason DNS records are set to "DNS only" today,
# which in turn means the origin has no DDoS protection whatsoever. DNS-01
# proves ownership through a DNS record instead, so it keeps working behind the
# proxy, and it needs a Caddy build that can write that record. The standard
# image cannot; this one can.
#
# The module is additive. While CADDY_ACME selects `acme-default` — the empty
# snippet, which is Caddy's own behaviour — this image behaves exactly like the
# stock one. That is what made it safe to adopt in a separate, boring deploy
# ahead of the change that depends on it.

# Cross-compiled, not emulated.
#
# The production VPS is arm64 (a Hetzner CAX) and GitHub's runners are amd64,
# so an image built the obvious way on CI cannot execute there at all: the
# container exec-fails and restarts forever, which is precisely what happened
# on 2026-08-27 and which the deploy reported as a success.
#
# `--platform=$BUILDPLATFORM` pins the *builder* stage to the machine doing the
# building, and GOOS/GOARCH tell Go what to emit. Go cross-compiles natively, so
# an arm64 binary is produced at amd64 speed. Without the pin, buildx would
# instead run the whole Go toolchain under QEMU for the foreign architecture —
# correct, and slow enough to put us back where this started.
FROM --platform=$BUILDPLATFORM caddy:2-builder-alpine AS builder

# Supplied by BuildKit from the requested --platform; defaulted so a plain
# `docker build` with no platform flag still works for a local smoke test.
ARG TARGETOS=linux
ARG TARGETARCH

RUN GOOS=${TARGETOS} GOARCH=${TARGETARCH} xcaddy build \
    --with github.com/caddy-dns/cloudflare

# Not pinned: this stage must be the *target* platform, so the runtime layers
# underneath the binary match the machine that will run it.
FROM caddy:2-alpine

COPY --from=builder /usr/bin/caddy /usr/bin/caddy
