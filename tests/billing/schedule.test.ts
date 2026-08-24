// The reconciliation container's crontab, checked by generating it.
//
// docs/CUTOVER_RUNBOOK.md makes a scheduled sweep with an alert on a non-zero
// exit a precondition for cancelling Ghost, because webhooks are an
// optimisation over polling rather than a guarantee. Two things have to hold for
// that to mean anything: the job must run the sweep for real rather than as a
// dry run, since a report nobody acts on is not a safety net; and the container
// must refuse to start without a Stripe key rather than fail quietly every
// night at 02:30.

import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { crontabLines, runEntrypoint } from '../support/entrypoint'

const root = resolve(import.meta.dirname, '../..')
const entrypoint = join(root, 'docker/reconcile/entrypoint.sh')

const withKey = { STRIPE_SECRET_KEY: 'sk_test_stub' }

describe('reconciliation container crontab', () => {
  it('installs the daily sweep by default', () => {
    const lines = crontabLines(runEntrypoint(entrypoint, withKey))

    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/^30 2 \* \* \* /)
    expect(lines[0]).toContain('reconcile:billing')
  })

  it('honours the configured schedule', () => {
    const lines = crontabLines(
      runEntrypoint(entrypoint, { ...withKey, RECONCILE_CRON: '0 5 * * *' }),
    )

    expect(lines[0]).toMatch(/^0 5 \* \* \* /)
  })

  it('records what Stripe says rather than only reporting it', () => {
    // `--dry-run` reads both sides and writes nothing. That is the right mode
    // for the pre-cutover backfill, where a human reads the report; it is the
    // wrong one for the nightly sweep, whose whole job is to close the gap a
    // missed webhook left in the member records.
    const lines = crontabLines(runEntrypoint(entrypoint, withKey))

    expect(lines[0]).not.toContain('--dry-run')
  })

  it('refuses to start without a Stripe key', () => {
    // Explicitly blank rather than merely absent: the helper inherits the
    // ambient environment, and a developer with a key exported would otherwise
    // see this pass for the wrong reason.
    const run = runEntrypoint(entrypoint, { STRIPE_SECRET_KEY: '' })

    expect(run.status).not.toBe(0)
    expect(run.crontab).toBeNull()
    expect(run.stderr).toContain('STRIPE_SECRET_KEY')
  })

  it('is the script docker-compose.yml actually starts', () => {
    // The migrator image copies the repository to /app, so Compose names this
    // script by an absolute container path. Nothing exercises that path until
    // an operator enables the profile — which happens once, at cutover, which
    // is the worst possible moment to discover the file moved.
    const compose = readFileSync(join(root, 'docker-compose.yml'), 'utf8')
    const named = compose.match(/entrypoint: \['\/bin\/sh', '(\/app\/[^']+)'\]/)

    expect(
      named,
      'no reconcile entrypoint found in docker-compose.yml',
    ).not.toBeNull()
    expect(existsSync(join(root, named![1]!.replace('/app/', '')))).toBe(true)
  })

  it('writes no literal percent sign into a job command', () => {
    // cron reads `%` as a newline: everything after the first one stops being
    // part of the command and becomes the job's stdin.
    for (const line of crontabLines(runEntrypoint(entrypoint, withKey))) {
      expect(line).not.toContain('%')
    }
  })
})
