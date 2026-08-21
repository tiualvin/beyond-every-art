// Runs a container entrypoint script in a sandbox and reports what it did.
//
// The scheduled work in this stack — the nightly backup, the weekly restore
// check, the daily Stripe sweep — is defined entirely in shell scripts that
// nothing else executes. A quoting mistake or a stray flag in one of them
// surfaces at 03:00 on the VPS, inside a container whose log nobody reads until
// something has already gone wrong. Generating the crontab here is the only
// cheap way to find out before then.
//
// The scripts write to absolute container paths, so those are redirected into a
// temporary directory first. Every redirection is asserted rather than assumed:
// a rewrite that quietly stops matching would leave a suite testing a script
// that never ran the lines it claims to check.

import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect } from 'vitest'

export interface EntrypointRun {
  /** Exit status of the script. */
  status: number
  stdout: string
  stderr: string
  /** Contents of the crontab it installed, or null if it installed none. */
  crontab: string | null
}

/** Commands that never return by design, and are not what any suite is about. */
const LONG_RUNNING = [
  // Runs in the foreground as the script's last act.
  'crond',
  // Follows the log forever, holding the stdout this helper reads.
  'tail',
]

export function runEntrypoint(
  entrypoint: string,
  env: Record<string, string> = {},
): EntrypointRun {
  const dir = mkdtempSync(join(tmpdir(), 'entrypoint-'))
  for (const sub of ['app', 'bin', 'crontabs', 'log']) {
    mkdirSync(join(dir, sub))
  }
  for (const command of LONG_RUNNING) {
    writeFileSync(join(dir, 'bin', command), '#!/bin/sh\nexit 0\n', {
      mode: 0o755,
    })
  }

  let script = readFileSync(entrypoint, 'utf8')
  for (const [from, to] of [
    ['/app', join(dir, 'app')],
    ['/var/log', join(dir, 'log')],
    ['/etc/crontabs', join(dir, 'crontabs')],
  ] as const) {
    expect(script, `${entrypoint} no longer references ${from}`).toContain(from)
    script = script.split(from).join(to)
  }

  const local = join(dir, 'entrypoint.sh')
  writeFileSync(local, script, { mode: 0o755 })

  const result = spawnSync('sh', [local], {
    env: {
      ...process.env,
      ...env,
      PATH: `${join(dir, 'bin')}:${process.env.PATH}`,
    },
    encoding: 'utf8',
    // A hang means the script grew a step that does not return. Fail on it
    // rather than letting CI sit on a job timeout.
    timeout: 30_000,
  })

  let crontab: string | null = null
  try {
    crontab = readFileSync(join(dir, 'crontabs', 'root'), 'utf8')
  } catch {
    // A script that refused to start installs nothing, which is the point.
  }

  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    crontab,
  }
}

/** The installed job lines, with the trailing newline dropped. */
export function crontabLines(run: EntrypointRun): string[] {
  expect(run.status, `entrypoint exited ${run.status}: ${run.stderr}`).toBe(0)
  expect(run.crontab, 'entrypoint installed no crontab').not.toBeNull()
  return run.crontab!.trim().split('\n')
}
