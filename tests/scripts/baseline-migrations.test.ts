import { describe, expect, it } from 'vitest'

import {
  decideBaseline,
  findInitialMigration,
  type DatabaseState,
} from '../../scripts/baseline-migrations'

const state = (overrides: Partial<DatabaseState> = {}): DatabaseState => ({
  appliedMigrations: [],
  hasMigrationsTable: false,
  hasSchema: false,
  ...overrides,
})

describe('findInitialMigration', () => {
  it('returns the earliest migration, not the earliest file', () => {
    expect(
      findInitialMigration([
        '20260901_120000_add_mcp_keys.ts',
        'index.ts',
        '20260728_102927_initial.ts',
        '20260728_102927_initial.json',
      ]),
    ).toBe('20260728_102927_initial')
  })

  it('returns undefined when no migration files exist', () => {
    expect(findInitialMigration(['index.ts', 'README.md'])).toBeUndefined()
  })
})

describe('decideBaseline', () => {
  it('baselines a database whose schema predates migrations', () => {
    const decision = decideBaseline(state({ hasSchema: true }), 'a_initial')

    expect(decision.action).toBe('baseline')
    expect(decision).toMatchObject({ migration: 'a_initial' })
  })

  it('does nothing for an empty database, which should just migrate', () => {
    expect(decideBaseline(state(), 'a_initial').action).toBe('nothing-to-do')
  })

  it('is safe to rerun once the baseline is recorded', () => {
    const decision = decideBaseline(
      state({
        appliedMigrations: ['a_initial'],
        hasMigrationsTable: true,
        hasSchema: true,
      }),
      'a_initial',
    )

    expect(decision.action).toBe('nothing-to-do')
  })

  // The dangerous case: a database that has run migrations but not this one is
  // not a pre-migrations database. Recording the initial migration there would
  // permanently skip whatever it actually needs.
  it('refuses a database with other migrations recorded', () => {
    const decision = decideBaseline(
      state({
        appliedMigrations: ['b_second'],
        hasMigrationsTable: true,
        hasSchema: true,
      }),
      'a_initial',
    )

    expect(decision.action).toBe('refuse')
  })

  it('refuses when there is no migration to baseline', () => {
    expect(decideBaseline(state({ hasSchema: true }), undefined).action).toBe(
      'refuse',
    )
  })
})
