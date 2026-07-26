// Read-only source-vs-target migration crawl.
//
//   pnpm migration:compare --source https://legacy.example.com \
//     --target https://staging.example.com
//
// The command writes a detailed deterministic JSON artifact and a concise text
// report. It exits non-zero when the configured issue threshold is reached.

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import {
  basicAuthorizationFromEnvironment,
  compareCrawls,
  crawlSite,
  DEFAULT_CRAWL_SEEDS,
  renderHumanReport,
  type CrawlOptions,
  type IssueSeverity,
} from '../lib/migration-verification'

type FailOn = IssueSeverity | 'never'

interface CliOptions {
  source: string
  target: string
  seeds: string[]
  crawl: Partial<CrawlOptions>
  jsonPath: string
  reportPath: string
  failOn: FailOn
  allowTargetNoindex: boolean
  sourceBasicAuthEnv?: string
  targetBasicAuthEnv?: string
}

function valuesFor(argv: string[], flag: string): string[] {
  const values: string[] = []
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== flag) continue
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`${flag} requires a value`)
    }
    values.push(value)
  }
  return values
}

function oneValue(argv: string[], flag: string): string | undefined {
  const values = valuesFor(argv, flag)
  if (values.length > 1) throw new Error(`${flag} may only be provided once`)
  return values[0]
}

function integerValue(argv: string[], flag: string): number | undefined {
  const value = oneValue(argv, flag)
  if (value === undefined) return undefined
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} must be a positive integer`)
  }
  return parsed
}

function parseArgs(argv: string[]): CliOptions {
  if (argv.includes('--help')) {
    process.stdout.write(`Usage:
  pnpm migration:compare --source <origin> --target <origin> [options]

Options:
  --seed <path>             Repeatable additional crawl seed
  --max-pages <n>           Page cap per origin (default: 500, max: 10000)
  --concurrency <n>         Concurrent requests (default: 4, max: 32)
  --timeout-ms <n>          Per-response timeout (default: 10000)
  --max-redirects <n>       Redirect cap per URL (default: 8)
  --max-response-bytes <n>  HTML response cap (default: 2000000)
  --max-evidence <n>        Link/image cap per page (default: 500)
  --json <path>             JSON output (default: migration-site-comparison.json)
  --report <path>           Text output (default: migration-site-comparison.txt)
  --fail-on <error|warning|never> (default: error)
  --source-basic-auth-env <name>  Read source user:password from this env var
  --target-basic-auth-env <name>  Read target user:password from this env var
  --allow-target-noindex    Ignore only index/follow polarity on gated staging

Only exact-origin HTTP(S) pages are fetched. Query strings, fragments,
credentials in URLs/CLI values, cookies, tokens, and private exports are not supported.
Basic auth is accepted only by naming an environment variable.
`)
    process.exit(0)
  }

  const source = oneValue(argv, '--source')
  const target = oneValue(argv, '--target')
  if (!source || !target) {
    throw new Error('Provide --source <origin> and --target <origin>')
  }
  const failOn = oneValue(argv, '--fail-on') ?? 'error'
  if (!['error', 'warning', 'never'].includes(failOn)) {
    throw new Error('--fail-on must be error, warning, or never')
  }
  const crawl: Partial<CrawlOptions> = {}
  const numericFlags: [string, keyof CrawlOptions][] = [
    ['--max-pages', 'maxPages'],
    ['--concurrency', 'concurrency'],
    ['--timeout-ms', 'requestTimeoutMs'],
    ['--max-redirects', 'maxRedirects'],
    ['--max-response-bytes', 'maxResponseBytes'],
    ['--max-evidence', 'maxEvidencePerPage'],
  ]
  for (const [flag, key] of numericFlags) {
    const value = integerValue(argv, flag)
    if (value !== undefined) Object.assign(crawl, { [key]: value })
  }
  return {
    source,
    target,
    seeds: [...new Set([...DEFAULT_CRAWL_SEEDS, ...valuesFor(argv, '--seed')])],
    crawl,
    jsonPath: oneValue(argv, '--json') ?? 'migration-site-comparison.json',
    reportPath: oneValue(argv, '--report') ?? 'migration-site-comparison.txt',
    failOn: failOn as FailOn,
    sourceBasicAuthEnv: oneValue(argv, '--source-basic-auth-env'),
    targetBasicAuthEnv: oneValue(argv, '--target-basic-auth-env'),
    allowTargetNoindex: argv.includes('--allow-target-noindex'),
  }
}

async function writeOutput(path: string, contents: string): Promise<void> {
  const absolutePath = resolve(path)
  await mkdir(dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, contents, { encoding: 'utf8', mode: 0o600 })
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const sourceAuthorization = basicAuthorizationFromEnvironment(
    options.sourceBasicAuthEnv,
  )
  const targetAuthorization = basicAuthorizationFromEnvironment(
    options.targetBasicAuthEnv,
  )
  const source = await crawlSite(
    options.source,
    options.seeds,
    options.crawl,
    fetch,
    { authorization: sourceAuthorization },
  )

  // Every source URL is an explicit target seed. Target discovery is still
  // enabled, but a missing source URL cannot hide merely because target
  // navigation no longer links to it.
  const targetSeeds = [...new Set(source.pages.map((page) => page.path))].sort()
  const target = await crawlSite(
    options.target,
    targetSeeds,
    options.crawl,
    fetch,
    { authorization: targetAuthorization },
  )
  const comparison = compareCrawls(source, target, {
    allowTargetNoindex: options.allowTargetNoindex,
  })
  const human = renderHumanReport(comparison)

  await Promise.all([
    writeOutput(options.jsonPath, `${JSON.stringify(comparison, null, 2)}\n`),
    writeOutput(options.reportPath, human),
  ])
  process.stdout.write(human)
  process.stdout.write(
    `JSON: ${resolve(options.jsonPath)}\nReport: ${resolve(options.reportPath)}\n`,
  )

  const shouldFail =
    options.failOn === 'warning'
      ? comparison.issues.length > 0
      : options.failOn === 'error'
        ? comparison.summary.errors > 0
        : false
  if (shouldFail) process.exitCode = 1
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
