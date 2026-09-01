FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# One-shot image for applying schema migrations. The runtime image below is a
# Next.js standalone bundle, which ships `server.js` and its traced imports but
# not the Payload CLI, tsx, or `payload.config.ts` — so it cannot migrate its
# own database. This stage keeps the full dependency tree and sources instead,
# and skips `pnpm build` because a migration never renders a page.
FROM base AS migrator
COPY --from=dependencies /app/node_modules ./node_modules
# Busts the layer cache for the source copy below, once per commit.
#
# `COPY . .` is content-addressed and should invalidate on its own. On 1 Sep it
# did not: in one deploy, from one checkout of b00266c, the `migrator` stage
# copied the new sources (`#12 DONE 23.0s`) while this stage was answered from
# cache (`#12 CACHED`) — so `pnpm build` re-ran against the *previous* commit's
# tree and produced a bundle with a fresh build id and none of the fix in it.
# Production stayed broken through a deploy that reported success, containers
# recreated and health verified, because everything downstream of a wrong
# `COPY` is faithfully built from the wrong thing.
#
# SOURCE_COMMIT changes every commit, so the layer below it can never be
# answered from a previous build's cache. It costs one context transfer per
# deploy (~20s) and leaves the `dependencies` stage — the slow one — cached.
# Empty by default, which keeps local builds behaving as they always have.
#
# It has to be a `RUN`, not the `ENV` this was first written as. BuildKit
# treats `ENV` and `ARG` as metadata: they change the image config and not the
# filesystem state, and a `COPY` is keyed on the state it builds upon — so an
# `ENV` above it changes nothing about its cache key. That version deployed on
# 1 Sep and the build was still answered `#12 CACHED`. A `RUN` produces a real
# state vertex whose key includes the expanded command, so a new SHA forces
# every step beneath it. The same reason is why neither shows up in BuildKit's
# `[builder 2/3]` step count, which is what made the failed attempt look like
# it had not been deployed at all.
ARG SOURCE_COMMIT=""
RUN echo "$SOURCE_COMMIT" > /etc/source-commit
COPY . .
# The Ghost importer writes uploads here, so this stage needs the directory to
# exist with the runtime image's ownership: whichever service touches the media
# volume first is the one Docker initialises it from, and a root-owned volume
# would leave the app (uid 1001) unable to accept an upload.
RUN mkdir -p /app/media && chown 1001:1001 /app/media
CMD ["pnpm", "migrate:db"]

FROM base AS builder
COPY --from=dependencies /app/node_modules ./node_modules
# Same cache break as the `migrator` stage above, and the stage it was actually
# observed on. See the comment there.
ARG SOURCE_COMMIT=""
RUN echo "$SOURCE_COMMIT" > /etc/source-commit
COPY . .
# `NEXT_PUBLIC_*` values are read at build time, not at run time: Next.js
# substitutes them into the client bundle during `pnpm build`, so a value that
# only arrives later through Compose's `env_file` is never seen by the browser.
# The checkout URLs are the case that matters — `checkoutUrl()` in
# lib/membership.ts runs inside a client component (`site-chrome.tsx`), and
# without these the subscribe modal silently renders "not open yet" on a
# correctly configured host. Empty defaults keep the build working when they are
# unset, which is the honest result: no link configured, so no button.
ARG NEXT_PUBLIC_CHECKOUT_URL_MONTHLY=""
ARG NEXT_PUBLIC_CHECKOUT_URL_YEARLY=""
ENV NEXT_PUBLIC_CHECKOUT_URL_MONTHLY=$NEXT_PUBLIC_CHECKOUT_URL_MONTHLY
ENV NEXT_PUBLIC_CHECKOUT_URL_YEARLY=$NEXT_PUBLIC_CHECKOUT_URL_YEARLY
RUN pnpm build

FROM node:20-alpine AS runner
ENV NODE_ENV=production
# Docker sets HOSTNAME to the container ID by default, and Next's standalone
# server binds to it instead of all interfaces, so loopback (used by the
# Compose healthcheck and the deploy workflow's internal health check) can
# never reach it. Override it explicitly so the server binds to 0.0.0.0.
ENV HOSTNAME="0.0.0.0"
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# No `COPY` of `public` here, and that is a live constraint rather than an
# omission: `output: 'standalone'` does not copy `public` (it assumes a CDN
# serves it) and nothing else here does either, because the Caddyfile has no
# `file_server` and reverse proxies every path to this container.
#
# So the first file added to a `public` directory in this repository is a 404 in
# production while working perfectly under `next dev`. Add the directory and a
# `COPY --from=builder --chown=nextjs:nodejs /app/public ./public` line together,
# never one without the other — a `COPY` of a directory that does not exist
# fails the build outright, which is why this line cannot simply be left here
# against future need.
#
# That is not hypothetical: the line has now been added and removed twice. The
# first time it referenced a `public` that had never existed and broke the
# build, which is what the `app-image` CI job was added to catch (see
# docs/DEPLOYMENT_STATUS.md). The second time it arrived with a `public/ads.txt`
# that has since moved back to the repository root — see docs/ADVERTISING.md §1
# for why the root is where that particular file belongs.
#
# Payload serves local uploads from `path.resolve('media')`, which is /app/media
# under this working directory. It must exist and be writable before the volume
# is mounted over it — see the migrator stage above, and the `media_data` volume
# in docker-compose.yml for why the directory cannot just live in the container.
RUN mkdir -p /app/media && chown nextjs:nodejs /app/media

# The commit this image was built from, so the deploy can ask the *running
# container* what it actually is instead of inferring it.
#
# On 1 Sep two deploys reported success — checkout advanced, containers
# recreated, `/health` verified — while shipping the previous commit's code,
# because a cached `COPY` fed `pnpm build` the wrong tree. Nothing downstream
# could tell: the old code is healthy, so every check passed. Even the Next
# build id changed each time, which is the one thing that looks like proof of a
# rebuild and is not.
#
# `ENV` is right here — this is identification, not cache busting, and the
# barrier above is what forces the rebuild.
ARG SOURCE_COMMIT=""
ENV SOURCE_COMMIT=$SOURCE_COMMIT

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
