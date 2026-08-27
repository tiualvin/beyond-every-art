// Validates the redirect table against a running site.
//
//   pnpm validate:redirects --target https://staging.beyondeveryart.com \
//     --input ghost-export/redirects.json \
//     --basic-auth-env STAGING_CRAWL_BASIC_AUTH
//
//   pnpm validate:redirects --target https://www.beyondeveryart.com \
//     --redirects-map https://cms.beyondeveryart.com/redirects-map/
//
// The rehearsal and the cutover runbook both say to spot-check "several" or "a
// handful" of redirects by hand. This checks every one of them, plus the
// built-in rules for the Ghost URL shapes this site does not serve, and exits
// non-zero if any fails — so it can gate a cutover the way `migrate:validate`
// gates the import.
//
// For each rule it asserts: the source answers with the configured status, the
// Location points where the rule says, and the destination answers 200 rather
// than another redirect or a 404. A rule the middleware matcher can never run
// is reported as an error whatever the response was.
//
// Read-only. It issues GET requests and writes a JSON report; it never touches
// the database.
//
// Where the rules come from, in order of preference:
//   --input <path>         a Ghost redirects.json export (works before import)
//   --redirects-map <url>  the live table, as the middleware reads it
// Give both and the table wins, with the export checked for rows that never
// made it in. Give neither and only the built-in rules are checked.

import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { basicAuthorizationFromEnvironment } from '../lib/migration-verification'
import {
  buildRedirectPlan,
  parseGhostRedirects,
} from '../lib/migration/redirects'
import {
  buildChecks,
  judge,
  summarize,
  type Finding,
  type ObservedHop,
  type Observation,
  type RedirectCheck,
} from '../lib/seo/redirect-audit'
import { unservableRedirectSources } from '../lib/seo/middleware-coverage'
import type { RedirectRecord } from '../lib/seo/redirects'

const MAX_HOPS = 5
const USER_AGENT = 'BeyondEveryArt-RedirectValidator/1.0'

interface Cli {
  target: string
  input?: string
  redirectsMap?: string
  basicAuthEnv?: string
  tagSlugs: string[]
  authorSlugs: string[]
  extraPaths: string[]
  reportPath: string
  timeoutMs: number
}

function flagValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag)
  return index >= 0 ? argv[index + 1] : undefined
}

function flagValues(argv: string[], flag: string): string[] {
  const values: string[] = []
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== flag) continue
    const value = argv[index + 1]
    if (!value || value.startsWith('--'))
      throw new Error(`${flag} requires a value`)
    values.push(value)
  }
  return values
}

function parseArgs(argv: string[]): Cli {
  const target = flagValue(argv, '--target')
  if (!target) throw new Error('Provide --target <origin>')

  let origin: string
  try {
    const url = new URL(target)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('unsupported protocol')
    }
    origin = url.origin
  } catch {
    throw new Error(`--target must be an http(s) origin: ${target}`)
  }

  const timeout = Number(flagValue(argv, '--timeout-ms') ?? 10_000)
  if (!Number.isSafeInteger(timeout) || timeout < 1) {
    throw new Error('--timeout-ms must be a positive integer')
  }

  return {
    target: origin,
    input: flagValue(argv, '--input'),
    redirectsMap: flagValue(argv, '--redirects-map'),
    basicAuthEnv: flagValue(argv, '--basic-auth-env'),
    tagSlugs: flagValues(argv, '--tag'),
    authorSlugs: flagValues(argv, '--author'),
    extraPaths: flagValues(argv, '--path'),
    reportPath: flagValue(argv, '--report') ?? 'redirect-validation.json',
    timeoutMs: timeout,
  }
}

/** The rules a Ghost export would import, in the collection's own shape. */
async function rulesFromExport(path: string): Promise<RedirectRecord[]> {
  const { readFile } = await import('node:fs/promises')
  const parsed = parseGhostRedirects(
    JSON.parse(await readFile(resolve(path), 'utf8')),
  )
  return buildRedirectPlan(parsed).map((rule) => ({
    source: rule.source,
    destination: rule.destination,
    statusCode: rule.statusCode,
    enabled: true,
  }))
}

/** The live table, read the way the middleware reads it. */
async function rulesFromMap(
  url: string,
  authorization: string | undefined,
  timeoutMs: number,
): Promise<RedirectRecord[]> {
  const response = await fetch(url, {
    headers: {
      'user-agent': USER_AGENT,
      ...(authorization ? { authorization } : {}),
    },
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!response.ok) {
    // Caddy answers `/redirects-map` with a 404 on the public hostname by
    // design, so this is the expected result of pointing at the site rather
    // than at the CMS host. Say which, or it reads as the table being empty.
    throw new Error(
      `${url} answered ${response.status}. The redirect map is served only on ` +
        'the CMS hostname; point --redirects-map at that one.',
    )
  }

  const body = (await response.json()) as { redirects?: RedirectRecord[] }
  if (!Array.isArray(body.redirects)) {
    throw new Error(`${url} did not return a redirects array`)
  }
  return body.redirects
}

/** Walk the chain from one source, recording each hop. */
async function observe(
  origin: string,
  source: string,
  authorization: string | undefined,
  timeoutMs: number,
): Promise<Observation> {
  const hops: ObservedHop[] = []
  let url = new URL(source, origin).toString()

  try {
    for (let hop = 0; hop < MAX_HOPS; hop += 1) {
      const response = await fetch(url, {
        redirect: 'manual',
        headers: {
          'user-agent': USER_AGENT,
          ...(authorization ? { authorization } : {}),
        },
        signal: AbortSignal.timeout(timeoutMs),
      })

      const location = response.headers.get('location')
      hops.push({ url, status: response.status, location })

      if (response.status < 300 || response.status >= 400 || !location) {
        return { hops, finalStatus: response.status, finalUrl: url }
      }

      const next = new URL(location, url)
      // Never follow a redirect off the target origin: an off-site destination
      // is somebody else's server and its status is not this migration's to
      // assert (or to make requests against on every run).
      if (next.origin !== origin) {
        return { hops, finalStatus: null, finalUrl: next.toString() }
      }
      url = next.toString()
    }

    return {
      hops,
      finalStatus: null,
      finalUrl: url,
      error: `more than ${MAX_HOPS} redirects`,
    }
  } catch (error) {
    return {
      hops,
      finalStatus: null,
      finalUrl: url,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function main() {
  const cli = parseArgs(process.argv.slice(2))
  const authorization = basicAuthorizationFromEnvironment(cli.basicAuthEnv)

  const sources: string[] = []
  let rules: RedirectRecord[] = []

  if (cli.redirectsMap) {
    rules = await rulesFromMap(cli.redirectsMap, authorization, cli.timeoutMs)
    sources.push('live table')
  }

  if (cli.input) {
    const exported = await rulesFromExport(cli.input)
    sources.push('Ghost export')
    if (rules.length === 0) {
      rules = exported
    } else {
      // Both given: the table is what runs, and a rule in the export that is
      // missing from it is the interesting difference — an import that did not
      // land, which no amount of checking the table would ever show.
      const live = new Set(rules.map((rule) => rule.source))
      for (const rule of exported) {
        if (!live.has(rule.source)) rules.push(rule)
      }
    }
  }

  const checks: RedirectCheck[] = buildChecks({
    rules,
    tagSlugs: cli.tagSlugs,
    authorSlugs: cli.authorSlugs,
    extraPaths: cli.extraPaths,
  })

  const findings: Finding[] = []
  for (const check of checks) {
    findings.push(
      ...judge(
        check,
        await observe(cli.target, check.source, authorization, cli.timeoutMs),
      ),
    )
  }

  const summary = summarize(checks, findings)
  const report = {
    ...summary,
    target: cli.target,
    ruleSources: sources.length > 0 ? sources : ['built-in only'],
    // Reported separately as well as per-check, because this one is a
    // configuration fact rather than an observation: these rules cannot work on
    // any host, so seeing them listed together is the point.
    unservableSources: unservableRedirectSources(checks.map((c) => c.source)),
    findings,
  }

  await writeFile(
    resolve(cli.reportPath),
    `${JSON.stringify(report, null, 2)}\n`,
  )

  process.stdout.write(
    `${summary.checked} redirects checked against ${cli.target}: ` +
      `${summary.errors} error(s), ${summary.warnings} warning(s)\n`,
  )
  for (const finding of findings) {
    process.stdout.write(`  [${finding.severity}] ${finding.message}\n`)
  }
  process.stdout.write(`Report written to ${cli.reportPath}\n`)

  if (!summary.ok) process.exitCode = 1
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
