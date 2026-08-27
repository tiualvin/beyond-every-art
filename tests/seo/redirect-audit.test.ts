// What "the redirects work" has to mean before a cutover can rely on it.
//
// A status check alone passes for a rule that permanently redirects onto a 404,
// for a rule the matcher can never run, and for a rule that reaches its
// destination in three hops. Each of those is a real outcome of this migration:
// the first from pointing a rule at a paginated URL past the end of an archive,
// the second from any source containing a dot, the third from a stored
// destination missing its trailing slash. All three are pinned here.

import { describe, expect, it } from 'vitest'

import {
  buildChecks,
  judge,
  summarize,
  type Observation,
  type RedirectCheck,
} from '@/lib/seo/redirect-audit'

const ORIGIN = 'https://www.example.com'

function check(overrides: Partial<RedirectCheck> = {}): RedirectCheck {
  return {
    source: '/old-post/',
    expectedStatus: 301,
    expectedDestination: '/new-post/',
    origin: 'table',
    ...overrides,
  }
}

function observed(
  hops: Array<[string, number, string | null]>,
  finalStatus: number | null = 200,
): Observation {
  const walked = hops.map(([url, status, location]) => ({
    url,
    status,
    location,
  }))
  return {
    hops: walked,
    finalStatus,
    finalUrl: walked[walked.length - 1]?.url ?? null,
  }
}

describe('buildChecks', () => {
  it('checks every enabled rule in the table', () => {
    const checks = buildChecks({
      rules: [
        { source: '/a/', destination: '/b/', statusCode: '301', enabled: true },
        { source: '/c/', destination: '/d/', statusCode: '302', enabled: true },
      ],
    })

    expect(
      checks
        .filter((c) => c.origin === 'table')
        .map((c) => [c.source, c.expectedStatus]),
    ).toEqual([
      ['/a/', 301],
      ['/c/', 302],
    ])
  })

  it('skips disabled and incomplete rows, which never reach the map either', () => {
    const checks = buildChecks({
      rules: [
        { source: '/a/', destination: '/b/', enabled: false },
        { source: '/c/', destination: '' },
        { source: '', destination: '/d/' },
      ],
    })

    expect(checks.filter((c) => c.origin === 'table')).toEqual([])
  })

  it('falls back to 301 for a status the collection could not have stored', () => {
    const [only] = buildChecks({
      rules: [{ source: '/a/', destination: '/b/', statusCode: '418' }],
    })
    expect(only!.expectedStatus).toBe(301)
  })

  it('adds the built-in legacy rules alongside the table', () => {
    const checks = buildChecks({
      rules: [{ source: '/a/', destination: '/b/', statusCode: '301' }],
      tagSlugs: ['painting'],
    })

    expect(checks.map((c) => c.source)).toEqual([
      '/a/',
      '/page/2/',
      '/page/3/',
      '/tag/painting/page/2/',
    ])
    expect(checks.filter((c) => c.origin === 'built-in')).toHaveLength(3)
  })

  it('checks a source once, as the table rule that actually applies', () => {
    // A row for `/page/2/` overrides the built-in rule in the middleware, so
    // checking it against the built-in destination would report a failure that
    // is really the override working.
    const checks = buildChecks({
      rules: [
        { source: '/page/2/', destination: '/elsewhere/', statusCode: '302' },
      ],
    })

    expect(checks.filter((c) => c.source === '/page/2/')).toHaveLength(1)
    expect(checks[0]).toMatchObject({
      origin: 'table',
      expectedStatus: 302,
      expectedDestination: '/elsewhere/',
    })
  })

  it('ignores an extra path no rule answers, rather than asserting a redirect', () => {
    const checks = buildChecks({ extraPaths: ['/a-real-post/'] })

    expect(checks.map((c) => c.source)).not.toContain('/a-real-post/')
  })

  it('always probes the home pagination, which every Ghost site has', () => {
    // There is no rule and no export entry for these — Ghost served them
    // itself — so nothing else would ever cause them to be checked.
    expect(buildChecks().map((c) => c.source)).toEqual(['/page/2/', '/page/3/'])
  })
})

describe('judge', () => {
  it('passes a rule that redirects once, correctly, onto a live page', () => {
    expect(
      judge(
        check(),
        observed([
          [`${ORIGIN}/old-post/`, 301, `${ORIGIN}/new-post/`],
          [`${ORIGIN}/new-post/`, 200, null],
        ]),
      ),
    ).toEqual([])
  })

  it('reports a source the rule was never applied to', () => {
    const [finding] = judge(
      check(),
      observed([[`${ORIGIN}/old-post/`, 404, null]], 404),
    )

    expect(finding).toMatchObject({ severity: 'error', code: 'not_redirected' })
  })

  it('reports the wrong status code', () => {
    const [finding] = judge(
      check(),
      observed([
        [`${ORIGIN}/old-post/`, 302, `${ORIGIN}/new-post/`],
        [`${ORIGIN}/new-post/`, 200, null],
      ]),
    )

    expect(finding).toMatchObject({
      severity: 'error',
      code: 'wrong_status',
      expected: 301,
      actual: 302,
    })
  })

  it('reports a redirect to the wrong place', () => {
    const [finding] = judge(
      check(),
      observed([
        [`${ORIGIN}/old-post/`, 301, `${ORIGIN}/somewhere-else/`],
        [`${ORIGIN}/somewhere-else/`, 200, null],
      ]),
    )

    expect(finding).toMatchObject({ code: 'wrong_destination' })
  })

  it('accepts the destination on whichever host the reader used', () => {
    // On-site destinations are resolved against the origin the reader dialled,
    // which is the whole point of `forwardedOrigin`. Only the path is ours.
    expect(
      judge(
        check(),
        observed([
          [`${ORIGIN}/old-post/`, 301, 'https://readers.example/new-post'],
          ['https://readers.example/new-post', 200, null],
        ]),
      ),
    ).toEqual([])
  })

  it('compares an off-site destination in full', () => {
    const offSite = check({ expectedDestination: 'https://elsewhere.test/x/' })

    expect(
      judge(
        offSite,
        observed(
          [[`${ORIGIN}/old-post/`, 301, 'https://elsewhere.test/x/']],
          null,
        ),
      ),
    ).toEqual([])

    const [finding] = judge(
      offSite,
      observed([[`${ORIGIN}/old-post/`, 301, 'https://other.test/x/']], null),
    )
    expect(finding).toMatchObject({ code: 'wrong_destination' })
  })

  it('reports a permanent redirect that lands on a 404', () => {
    // Worse than the 404 it replaced: a crawler records the destination as the
    // URL's new home and stops asking for either one.
    const findings = judge(
      check(),
      observed(
        [
          [`${ORIGIN}/old-post/`, 301, `${ORIGIN}/new-post/`],
          [`${ORIGIN}/new-post/`, 404, null],
        ],
        404,
      ),
    )

    expect(findings.map((f) => f.code)).toContain('dead_destination')
  })

  it('warns about a chain, without calling it a failure', () => {
    const [finding] = judge(
      check({ expectedDestination: '/new-post' }),
      observed([
        [`${ORIGIN}/old-post/`, 301, `${ORIGIN}/new-post`],
        [`${ORIGIN}/new-post`, 308, `${ORIGIN}/new-post/`],
        [`${ORIGIN}/new-post/`, 200, null],
      ]),
    )

    expect(finding).toMatchObject({
      severity: 'warning',
      code: 'redirect_chain',
      actual: 2,
    })
  })

  it('reports a source the matcher can never serve, however it responded', () => {
    // The failure that looks configured from every angle an editor has.
    const findings = judge(
      check({ source: '/ads.txt', expectedDestination: '/ads-elsewhere/' }),
      observed([[`${ORIGIN}/ads.txt`, 404, null]], 404),
    )

    expect(findings.map((f) => f.code)).toContain('unservable_source')
  })

  it('reports a failed request as one finding and stops there', () => {
    const findings = judge(check(), {
      hops: [],
      finalStatus: null,
      finalUrl: null,
      error: 'timeout',
    })

    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ code: 'request_failed' })
  })
})

describe('summarize', () => {
  it('is ok only when nothing failed', () => {
    const checks = [check()]

    expect(summarize(checks, [])).toEqual({
      ok: true,
      checked: 1,
      errors: 0,
      warnings: 0,
    })

    const warned = summarize(checks, [
      {
        severity: 'warning',
        code: 'redirect_chain',
        source: '/a/',
        origin: 'table',
        expected: 1,
        actual: 2,
        message: '',
      },
    ])
    expect(warned).toMatchObject({ ok: true, errors: 0, warnings: 1 })

    const failed = summarize(checks, [
      {
        severity: 'error',
        code: 'not_redirected',
        source: '/a/',
        origin: 'table',
        expected: 301,
        actual: 404,
        message: '',
      },
    ])
    expect(failed).toMatchObject({ ok: false, errors: 1 })
  })
})

describe('judge, on a source that never redirected', () => {
  it('reports it once rather than also as a dead destination', () => {
    // The "destination" of a 404 is the source itself. Reporting it twice
    // buries the finding that matters under a restatement of it — and with one
    // line per rule in the console output, a real cutover report is long enough
    // already.
    const findings = judge(
      check(),
      observed([[`${ORIGIN}/old-post/`, 404, null]], 404),
    )

    expect(findings.map((f) => f.code)).toEqual(['not_redirected'])
  })
})
