import config from '@payload-config'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPayload } from 'payload'

/**
 * One-time adoption of schema migrations by a database that predates them.
 *
 * The production database was created by Payload's automatic schema push
 * before `migrations/` existed, so its tables are already there. Running the
 * initial migration against it would fail on the first `CREATE TABLE`. This
 * records that migration as already applied — a baseline — so `pnpm migrate:db`
 * starts from the next one instead.
 *
 * It is deliberately narrow: it only ever inserts the *first* migration, never
 * a later one, so a real pending migration can never be skipped by running it.
 */

const filename = fileURLToPath(import.meta.url)
const migrationsDir = path.resolve(path.dirname(filename), '..', 'migrations')

export type DatabaseState = {
  /** Names already recorded in `payload_migrations`. */
  appliedMigrations: string[]
  /** Whether `payload_migrations` itself exists. */
  hasMigrationsTable: boolean
  /** Whether the schema is already present, judged by a core table. */
  hasSchema: boolean
}

export type BaselineDecision =
  | { action: 'baseline'; migration: string; reason: string }
  | { action: 'nothing-to-do'; reason: string }
  | { action: 'refuse'; reason: string }

/**
 * Decides what a database needs, without touching one. Kept pure so the
 * refusal cases are unit-testable; every branch here is a state some real
 * database can be in.
 */
export function decideBaseline(
  state: DatabaseState,
  initialMigration: string | undefined,
): BaselineDecision {
  if (!initialMigration) {
    return {
      action: 'refuse',
      reason:
        'No migration files found. Generate one with `pnpm migrate:db:create` before baselining.',
    }
  }

  if (state.appliedMigrations.includes(initialMigration)) {
    return {
      action: 'nothing-to-do',
      reason: `${initialMigration} is already recorded as applied. Run \`pnpm migrate:db\` for anything pending.`,
    }
  }

  if (state.appliedMigrations.length > 0) {
    return {
      action: 'refuse',
      reason:
        `This database has migrations recorded (${state.appliedMigrations.join(', ')}) but not ${initialMigration}. ` +
        'That is not a pre-migrations database, and baselining it would hide a real migration. Investigate by hand.',
    }
  }

  if (!state.hasSchema) {
    return {
      action: 'nothing-to-do',
      reason:
        'This database has no Payload schema, so there is nothing to baseline. Run `pnpm migrate:db` to build it from the migrations.',
    }
  }

  return {
    action: 'baseline',
    migration: initialMigration,
    reason:
      'Schema exists but no migration has ever been recorded: a database created by automatic push before migrations existed.',
  }
}

/** The earliest migration by filename; Payload's names sort chronologically. */
export function findInitialMigration(fileNames: string[]): string | undefined {
  return fileNames
    .filter((name) => /^\d{8}_\d{6}_.+\.ts$/.test(name))
    .map((name) => name.replace(/\.ts$/, ''))
    .sort()[0]
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const payload = await getPayload({ config })

  // The Postgres adapter's pool is the only way to ask about tables that
  // Payload does not model as a collection.
  const pool = (
    payload.db as unknown as {
      pool: {
        query: (
          text: string,
          values?: unknown[],
        ) => Promise<{ rows: Record<string, unknown>[] }>
      }
    }
  ).pool

  const tableExists = async (table: string): Promise<boolean> => {
    const { rows } = await pool.query(
      'SELECT to_regclass($1) IS NOT NULL AS present',
      [`public.${table}`],
    )
    return rows[0]?.present === true
  }

  const hasMigrationsTable = await tableExists('payload_migrations')
  const state: DatabaseState = {
    appliedMigrations: hasMigrationsTable
      ? (
          await pool.query(
            'SELECT name FROM payload_migrations WHERE name IS NOT NULL ORDER BY id',
          )
        ).rows.map((row) => String(row.name))
      : [],
    hasMigrationsTable,
    // `posts` is the collection this project cannot function without; if it is
    // there, the schema was built.
    hasSchema: await tableExists('posts'),
  }

  const initialMigration = findInitialMigration(readdirSync(migrationsDir))
  const decision = decideBaseline(state, initialMigration)

  payload.logger.info(
    `Database state: schema ${state.hasSchema ? 'present' : 'absent'}, ` +
      `${state.appliedMigrations.length} migration(s) recorded.`,
  )

  if (decision.action === 'refuse') {
    throw new Error(decision.reason)
  }

  if (decision.action === 'nothing-to-do') {
    payload.logger.info(decision.reason)
    return
  }

  payload.logger.info(`Baseline required: ${decision.reason}`)

  if (dryRun) {
    payload.logger.info(
      `Dry run: would record ${decision.migration} as applied in batch 1. Nothing was written.`,
    )
    return
  }

  if (!state.hasMigrationsTable) {
    await pool.query(`CREATE TABLE IF NOT EXISTS "payload_migrations" (
      "id" serial PRIMARY KEY NOT NULL,
      "name" varchar,
      "batch" numeric,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    )`)
  }

  await pool.query(
    'INSERT INTO "payload_migrations" ("name", "batch") VALUES ($1, 1)',
    [decision.migration],
  )

  payload.logger.info(
    `Recorded ${decision.migration} as applied. Run \`pnpm migrate:db:status\` to confirm, then \`pnpm migrate:db\`.`,
  )
}

if (process.argv[1]?.endsWith('baseline-migrations.ts')) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error)
      process.exit(1)
    })
}
