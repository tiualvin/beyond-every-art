// Every report an operational script writes by default must be git-ignored.
//
// These scripts run in the repository checkout on the VPS, and their reports
// hold what they read: slugs, member rows, crawl evidence, redirect tables. The
// repository is public, and an untracked file is one `git add -A` from being
// committed — the reasoning the `ghost-export/` block in `.gitignore` spells
// out. Four defaults had slipped past it (`ghost-url-fix-report.json`,
// `redirects-report.json`, `content-repair-report.json`,
// `redirect-validation.json`), found while planning the production crawl
// comparison, along with the `rehearsal/` directory the comparator docs told
// people to write into. A rule in prose did not keep them out; this does.

import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const SCRIPTS = join(process.cwd(), 'scripts')

/** `?? 'something.json'` and `?? '.migration-reports/…'` fallbacks. */
function defaultReportPaths(): { script: string; path: string }[] {
  const found: { script: string; path: string }[] = []
  for (const script of readdirSync(SCRIPTS).filter((name) =>
    name.endsWith('.ts'),
  )) {
    const source = readFileSync(join(SCRIPTS, script), 'utf8')
    for (const match of source.matchAll(
      /\?\?\s*\n?\s*'([^']+\.(?:json|txt))'/g,
    )) {
      found.push({ script, path: match[1]! })
    }
  }
  return found
}

function isIgnored(path: string): boolean {
  // `--no-index` asks about the patterns alone, so the answer does not depend
  // on whether someone has already committed the file.
  const result = spawnSync('git', ['check-ignore', '--no-index', '-q', path])
  return result.status === 0
}

describe('default report paths', () => {
  const paths = defaultReportPaths()

  it('finds the defaults it is meant to police', () => {
    // A positive control: if the pattern above stops matching, every check
    // below passes vacuously.
    expect(paths.map((entry) => entry.path)).toEqual(
      expect.arrayContaining([
        'migration-report.json',
        '.migration-reports/site-comparison.json',
      ]),
    )
  })

  it.each(paths)('$script writes $path somewhere git ignores', ({ path }) => {
    expect(isIgnored(path)).toBe(true)
  })

  it('ignores the rehearsal directory the comparator docs once used', () => {
    expect(isIgnored('rehearsal/site-comparison.json')).toBe(true)
  })
})

describe('the migrate image', () => {
  // `.dockerignore` patterns are relative to the build context and match from
  // its root; a directory entry excludes everything beneath it.
  const patterns = readFileSync(join(process.cwd(), '.dockerignore'), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
  const excluded = (path: string) =>
    patterns.some((pattern) => {
      const regex = new RegExp(
        `^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}(/.*)?$`,
      )
      return regex.test(path)
    })

  it('still copies the source it needs', () => {
    // The positive control: a matcher that excluded everything would pass the
    // test below.
    expect(excluded('lib/content/tag-plan.ts')).toBe(false)
    expect(excluded('scripts/apply-tag-plan.ts')).toBe(false)
  })

  it.each([
    ...defaultReportPaths().map(({ path }) => path),
    'rehearsal/site-comparison.json',
    'ghost-archive/content/images/2026/02/a.jpg',
    'ghost-content.json',
    'ghost-members.csv',
    'seo-baseline/search-console-pages-20260901.csv',
  ])('does not bake %s into an image layer', (path) => {
    expect(excluded(path)).toBe(true)
  })
})
