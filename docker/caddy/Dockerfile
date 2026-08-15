# Caddy with the Cloudflare DNS module.
#
# NOT IN USE YET. `docker-compose.yml` still runs the stock `caddy:2-alpine`.
# This image exists so that turning on Cloudflare's proxy is a config change
# rather than a build problem discovered halfway through a cutover. Read
# docs/EDGE_PROTECTION.md before switching to it.
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
# The module is additive. Built and swapped in without any Caddyfile change,
# this image behaves exactly like the stock one — which is what makes it safe
# to adopt in a separate, boring deploy before the change that depends on it.

FROM caddy:2-builder-alpine AS builder

RUN xcaddy build \
    --with github.com/caddy-dns/cloudflare

FROM caddy:2-alpine

COPY --from=builder /usr/bin/caddy /usr/bin/caddy
