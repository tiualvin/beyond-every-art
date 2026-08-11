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
COPY . .
# The Ghost importer writes uploads here, so this stage needs the directory to
# exist with the runtime image's ownership: whichever service touches the media
# volume first is the one Docker initialises it from, and a root-owned volume
# would leave the app (uid 1001) unable to accept an upload.
RUN mkdir -p /app/media && chown 1001:1001 /app/media
CMD ["pnpm", "migrate:db"]

FROM base AS builder
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
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
# Payload serves local uploads from `path.resolve('media')`, which is /app/media
# under this working directory. It must exist and be writable before the volume
# is mounted over it — see the migrator stage above, and the `media_data` volume
# in docker-compose.yml for why the directory cannot just live in the container.
RUN mkdir -p /app/media && chown nextjs:nodejs /app/media
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
