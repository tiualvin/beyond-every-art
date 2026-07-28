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
CMD ["pnpm", "migrate:db"]

FROM base AS builder
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
