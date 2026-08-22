// The backup container's crontab, checked by generating it.
//
// The two invariants worth failing a build over are both about the restore job.
// It must stay on `--dry-run`, because `restore-database.ts` with `--yes`
// overwrites the target database and a cron entry that does that is a scheduled
// outage. And no job line may contain a literal `%`, which cron reads as a
// newline — it would truncate the command and hand the remainder to the job as
// stdin, quietly, at the moment the schedule fires.

import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { crontabLines, runEntrypoint } from '../support/entrypoint'

const entrypoint = resolve(
  import.meta.dirname,
  '../../docker/backup/entrypoint.sh',
)

const generate = (env: Record<string, string> = {}) =>
  crontabLines(runEntrypoint(entrypoint, env))

describe('backup container crontab', () => {
  it('installs the nightly backup and the weekly restore check by default', () => {
    const lines = generate()

    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatch(/^0 3 \* \* \* /)
    expect(lines[0]).toContain('scripts/backup-database.ts')
    expect(lines[1]).toMatch(/^0 4 \* \* 0 /)
    expect(lines[1]).toContain('scripts/restore-database.ts')
  })

  it('honours the configured schedules', () => {
    const lines = generate({
      BACKUP_CRON: '30 1 * * *',
      RESTORE_VERIFY_CRON: '15 2 * * 3',
    })

    expect(lines[0]).toMatch(/^30 1 \* \* \* /)
    expect(lines[1]).toMatch(/^15 2 \* \* 3 /)
  })

  it('installs no restore check when it is switched off', () => {
    const lines = generate({ RESTORE_VERIFY_CRON: 'off' })

    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('scripts/backup-database.ts')
  })

  it('treats a blank schedule as unset, not as off', () => {
    // `off` is the switch. Blank is not, and the difference matters: both this
    // script and docker-compose.yml default it with `:-`, which reads an empty
    // value as unset — so an operator who clears the variable expecting to
    // disable the check gets the default schedule instead. Better that this
    // says so than that the behaviour be discovered on the VPS.
    const lines = generate({ RESTORE_VERIFY_CRON: '' })

    expect(lines).toHaveLength(2)
    expect(lines[1]).toMatch(/^0 4 \* \* 0 /)
  })

  it('never schedules a destructive restore', () => {
    // `restore-database.ts` refuses to write without `--yes`. That refusal is
    // the last line of defence, and this is the one before it.
    const lines = generate()

    expect(lines[1]).toContain('--latest --dry-run')
    expect(lines.join('\n')).not.toContain('--yes')
  })

  it('writes no literal percent sign into a job command', () => {
    // cron reads `%` as a newline: everything after the first one stops being
    // part of the command and becomes the job's stdin.
    for (const line of generate()) expect(line).not.toContain('%')
  })
})
