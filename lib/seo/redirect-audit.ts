/**
 * Judging a redirect against what the running site actually did.
 *
 * The rehearsal checklist says "spot-check several redirects" and the cutover
 * runbook says "a handful". Both are the same instruction: check some of them,
 * by hand, and hope the rest are like the ones you checked. That is workable
 * for one or two rules and worthless as a gate — and the redirect table is the
 * one part of the migration whose failure is silent, because a broken rule
 * looks exactly like a URL nobody has asked for yet.
 *
 * The IO lives in `scripts/validate-redirects.ts`. What is here is the part
 * worth pinning: which checks a rule set implies, and whether an observed
 * response passes. Both are pure, so the interesting cases are tested rather
 * than discovered against a live host at cutover.
 */

import { legacyProbePaths, legacyGhostRedirect } from './ghost-urls'
import { middlewareServes } from './middleware-coverage'
import { normalizePath, type RedirectRecord } from './redirects'

/** Where a checked rule came from, which changes what a failure means. */
export type CheckOrigin = 'table' | 'built-in'

export interface RedirectCheck {
  source: string
  expectedStatus: number
  /** As stored: a path, or an absolute URL for an off-site destination. */
  expectedDestination: string
  origin: CheckOrigin
}

/** One hop of the chain a request actually walked. */
export interface ObservedHop {
  url: string
  status: number
  location: string | null
}

export interface Observation {
  hops: readonly ObservedHop[]
  /** Status of the last response in the chain. */
  finalStatus: number | null
  finalUrl: string | null
  error?: string | null
}

export type FindingSeverity = 'error' | 'warning'

export interface Finding {
  severity: FindingSeverity
  code: string
  source: string
  origin: CheckOrigin
  expected: unknown
  actual: unknown
  message: string
}

/**
 * The checks a rule set implies, in a stable order.
 *
 * Table rules come first, then the built-in legacy rules, then any extra path
 * the caller asked for. A source appearing in both the table and the built-ins
 * is checked once, as a table rule: that is the one the middleware applies.
 */
export function buildChecks({
  rules = [],
  tagSlugs = [],
  authorSlugs = [],
  extraPaths = [],
}: {
  rules?: readonly RedirectRecord[]
  tagSlugs?: readonly string[]
  authorSlugs?: readonly string[]
  extraPaths?: readonly string[]
} = {}): RedirectCheck[] {
  const checks: RedirectCheck[] = []
  const claimed = new Set<string>()

  for (const rule of rules) {
    if (rule.enabled === false) continue
    if (!rule.source || !rule.destination) continue

    const key = normalizePath(rule.source)
    if (claimed.has(key)) continue
    claimed.add(key)

    const status = Number(rule.statusCode)
    checks.push({
      source: rule.source,
      expectedStatus: [301, 302, 307, 308].includes(status) ? status : 301,
      expectedDestination: rule.destination,
      origin: 'table',
    })
  }

  for (const path of [
    ...legacyProbePaths({ tagSlugs, authorSlugs }),
    ...extraPaths,
  ]) {
    const key = normalizePath(path)
    if (claimed.has(key)) continue

    const built = legacyGhostRedirect(path)
    if (!built) continue

    claimed.add(key)
    checks.push({
      source: path,
      expectedStatus: built.statusCode,
      expectedDestination: built.destination,
      origin: 'built-in',
    })
  }

  return checks
}

/** Whether a `Location` value points at the destination the rule stored. */
function locationMatches(location: string, destination: string): boolean {
  const absolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(destination)

  if (absolute) {
    try {
      return new URL(location).toString() === new URL(destination).toString()
    } catch {
      return location === destination
    }
  }

  // An on-site destination is resolved against the origin the reader used, so
  // only the path is ours to assert — the host is whatever they dialled, which
  // is the property `forwardedOrigin` exists to get right and which the e2e
  // suite covers directly.
  try {
    return (
      normalizePath(new URL(location).pathname) === normalizePath(destination)
    )
  } catch {
    return normalizePath(location) === normalizePath(destination)
  }
}

/**
 * Everything wrong with one observed redirect, worst first.
 *
 * An empty array means the rule did what it says: the right status, to the
 * right place, and that place answers 200 in one hop.
 */
export function judge(
  check: RedirectCheck,
  observation: Observation,
): Finding[] {
  const findings: Finding[] = []
  const base = { source: check.source, origin: check.origin }

  if (observation.error) {
    return [
      {
        ...base,
        severity: 'error',
        code: 'request_failed',
        expected: check.expectedStatus,
        actual: observation.error,
        message: `${check.source}: the request failed (${observation.error}).`,
      },
    ]
  }

  // A rule the middleware never sees. Worth reporting against the live site as
  // well as at import time, because this is the shape that looks configured
  // from every angle an editor has.
  if (!middlewareServes(check.source)) {
    findings.push({
      ...base,
      severity: 'error',
      code: 'unservable_source',
      expected: 'a path the middleware matcher runs on',
      actual: check.source,
      message:
        `${check.source}: the middleware matcher skips this path, so the ` +
        'rule can never run however it is configured. Serve it from Caddy ' +
        'instead, or from the app.',
    })
  }

  const first = observation.hops[0]
  if (!first) {
    findings.push({
      ...base,
      severity: 'error',
      code: 'no_response',
      expected: check.expectedStatus,
      actual: null,
      message: `${check.source}: no response was recorded.`,
    })
    return findings
  }

  if (first.status !== check.expectedStatus) {
    findings.push({
      ...base,
      severity: 'error',
      code: first.status === 404 ? 'not_redirected' : 'wrong_status',
      expected: check.expectedStatus,
      actual: first.status,
      message:
        first.status === 404
          ? `${check.source}: answered 404. The rule is not being applied.`
          : `${check.source}: answered ${first.status}, expected ` +
            `${check.expectedStatus}.`,
    })
  } else if (!first.location) {
    findings.push({
      ...base,
      severity: 'error',
      code: 'no_location',
      expected: check.expectedDestination,
      actual: null,
      message: `${check.source}: redirected with no Location header.`,
    })
  } else if (!locationMatches(first.location, check.expectedDestination)) {
    findings.push({
      ...base,
      severity: 'error',
      code: 'wrong_destination',
      expected: check.expectedDestination,
      actual: first.location,
      message:
        `${check.source}: redirected to ${first.location}, expected ` +
        `${check.expectedDestination}.`,
    })
  }

  // Counted over the redirect responses rather than over `hops`, which also
  // holds the final 200 — every successful redirect has two hops.
  const redirects = observation.hops.filter(
    (hop) => hop.status >= 300 && hop.status < 400,
  ).length

  // Where the redirect ended up, which is the half a status check misses. A
  // permanent redirect onto a 404 is worse than the 404 it replaced: a crawler
  // records the destination as the URL's new home and stops asking for either.
  //
  // Only when something actually redirected: for a source that simply answered
  // 404, the "destination" is the source itself, and reporting it a second time
  // buries the one finding that matters under a restatement of it.
  if (
    redirects > 0 &&
    observation.finalStatus !== null &&
    observation.finalStatus >= 400
  ) {
    findings.push({
      ...base,
      severity: 'error',
      code: 'dead_destination',
      expected: 200,
      actual: observation.finalStatus,
      message:
        `${check.source}: the redirect lands on ${observation.finalUrl}, ` +
        `which answers ${observation.finalStatus}.`,
    })
  }

  // One rule, one redirect. Two is not broken, but it is a rule pointing at
  // another redirect — usually a stored destination missing its trailing slash,
  // which `trailingSlash: true` then fixes with a second round trip for every
  // reader and every crawl of that URL.
  if (redirects > 1 && findings.length === 0) {
    findings.push({
      ...base,
      severity: 'warning',
      code: 'redirect_chain',
      expected: 1,
      actual: redirects,
      message:
        `${check.source}: reached ${observation.finalUrl} in ${redirects} ` +
        'redirects. Point the rule at the final URL.',
    })
  }

  return findings
}

export interface AuditSummary {
  ok: boolean
  checked: number
  errors: number
  warnings: number
}

/** Roll findings up into the verdict the script exits on. */
export function summarize(
  checks: readonly RedirectCheck[],
  findings: readonly Finding[],
): AuditSummary {
  const errors = findings.filter((f) => f.severity === 'error').length
  return {
    ok: errors === 0,
    checked: checks.length,
    errors,
    warnings: findings.length - errors,
  }
}
