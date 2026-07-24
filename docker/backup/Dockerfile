# Standalone image for the nightly database backup job. It is intentionally
# tiny: the backup and restore scripts depend only on Node built-ins and the
# global fetch, so this image needs Node, the Postgres client tools, and tsx to
# run the TypeScript directly — no application node_modules, no build step.
#
# Build context is the repository root (see docker-compose.yml) so the COPY
# lines can reach lib/ and scripts/.
FROM node:20-alpine

RUN apk add --no-cache postgresql16-client tzdata \
  && npm install -g tsx@4.23.1 \
  && npm cache clean --force

WORKDIR /app

# Only the sources the backup/restore scripts actually import.
COPY package.json tsconfig.json ./
COPY lib ./lib
COPY scripts ./scripts
COPY docker/backup/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
