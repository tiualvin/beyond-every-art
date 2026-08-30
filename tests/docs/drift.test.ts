// Documented facts, checked against the code that makes them true or false.
//
// This repository leans hard on its docs — the handoff, the runbooks, the
// evaluations — and they are worth exactly as much as they are accurate. Three
// stale claims turned up in `MCP_SERVER.md` alone during one review: a pinned
// version that had moved two releases, an upstream bug that had been fixed, and
// a log line described as per-session that was per-request. Each was written
// true and quietly stopped being true, and each was found by a person reading
// carefully rather than by anything that would have caught it on its own.
//
// So the mechanical half of the problem is mechanised here. These tests cannot
// judge whether prose is a good explanation; they can tell you that a file it
// points at was renamed, that a version it quotes has moved, that an
// environment variable it documents is read by nothing, or that a route was
// added without reserving its path segment. Everything they check is something
// a person would otherwise have to notice.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { RESERVED_ROOT_SLUGS } from '../../lib/seo/reserved-slugs'

const root = resolve(import.meta.dirname, '../..')

/** Directories whose contents are source, not build output or dependencies. */
const SOURCE_DIRS = [
  'access',
  'app',
  'collections',
  'docker',
  'docs',
  'e2e',
  'globals',
  'lib',
  'migrations',
  'scripts',
  'tests',
]

function walk(dir: string, match: (path: string) => boolean): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...walk(path, match))
    else if (match(path)) found.push(path)
  }
  return found
}

function exists(path: string): boolean {
  try {
    statSync(path)
    return true
  } catch {
    return false
  }
}

const docFiles = [
  ...walk(join(root, 'docs'), (path) => path.endsWith('.md')),
  join(root, 'README.md'),
  join(root, 'AGENTS.md'),
  join(root, 'PRODUCT.md'),
].filter(exists)

const docs = docFiles.map((path) => ({
  path,
  name: relative(root, path),
  text: readFileSync(path, 'utf8'),
}))

/**
 * Root-level configuration, which is where several variables are actually
 * consumed: `docker-compose.yml` reads the memory limits and log rotation, the
 * Caddyfile reads the addresses. Leaving these out made every one of them look
 * dead.
 */
const ROOT_FILES = [
  'Caddyfile',
  'docker-compose.yml',
  'Dockerfile',
  'instrumentation.ts',
  'middleware.ts',
  'next.config.ts',
  'payload.config.ts',
  'playwright.config.ts',
]

const sourceFiles = [
  ...SOURCE_DIRS.filter((dir) => exists(join(root, dir))).flatMap((dir) =>
    walk(join(root, dir), (path) => /\.(ts|tsx|mjs|js|sh|ya?ml)$/.test(path)),
  ),
  ...walk(join(root, '.github'), (path) => /\.ya?ml$/.test(path)),
  ...ROOT_FILES.map((name) => join(root, name)),
].filter(exists)

const sourceText = sourceFiles
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n')

describe('documentation links', () => {
  // A renamed or deleted file leaves a link that still looks fine in a diff.
  it.each(docs)('$name links only to files that exist', ({ path, text }) => {
    // Two forms: the ordinary `](target)`, and `](<target>)` — which is what
    // Markdown requires when the path contains parentheses, as every link into
    // `app/(payload)` does. Reading only the first form finds a target that
    // stops at the first bracket and reports it as broken.
    const broken = [
      ...[...text.matchAll(/\]\(<([^>]+)>\)/g)].map((match) => match[1]!),
      ...[...text.matchAll(/\]\(([^)<\s]+)\)/g)].map((match) => match[1]!),
    ]
      .filter((target) => !/^(https?:|mailto:|#)/.test(target))
      .map((target) => target.split('#')[0]!)
      .filter(Boolean)
      .filter((target) => !exists(resolve(path, '..', target)))

    expect(broken).toEqual([])
  })
})

describe('documentation file references', () => {
  /**
   * Paths the docs name that are not files, and each one's reason.
   *
   * Two kinds live here. A design document laying out the file it argues for is
   * doing its job, and so is a record of a decision that was later taken
   * differently — neither is drift. Anything not on this list is.
   *
   * Keeping the reasons here rather than suppressing the check makes the list
   * useful in its own right: it is the inventory of what the docs promise and
   * have not delivered. Delete an entry when the file lands, and the test will
   * tell you if you delete one too early.
   */
  const NOT_FILES = new Set([
    // docs/SUBSCRIPTION_WEBHOOKS.md: "RevenueCat is not [built], and the
    // layout below is where it goes when it is." Planned.
    'app/webhooks/revenuecat/route.ts',
    // docs/superpowers/specs/2026-07-26-apps-page-design.md proposed this
    // path; the action shipped one level up, at `apps/actions.ts`, because it
    // is shared by the index and the detail page. The spec records the design,
    // and carries a note pointing at where it actually landed.
    'app/(frontend)/apps/[slug]/actions.ts',
  ])

  // Backticked paths are how these docs point at code, and they are not links,
  // so nothing has ever checked them. Only paths under a real source directory
  // are considered — that leaves out runtime artefacts a doc legitimately
  // names, like `.env` or a generated report, without needing a list of them.
  it.each(docs)('$name names only files that exist', ({ text, name }) => {
    const referenced = [...text.matchAll(/`([\w./[\]()-]+\.\w{1,4})`/g)]
      .map((match) => match[1]!)
      .filter((path) => SOURCE_DIRS.some((dir) => path.startsWith(`${dir}/`)))

    const missing = referenced.filter(
      (path) => !NOT_FILES.has(path) && !exists(join(root, path)),
    )

    expect(missing, `stale file references in ${name}`).toEqual([])
  })
})

describe('documented versions', () => {
  const manifest = JSON.parse(
    readFileSync(join(root, 'package.json'), 'utf8'),
  ) as {
    dependencies: Record<string, string>
    devDependencies: Record<string, string>
  }
  const installed = { ...manifest.dependencies, ...manifest.devDependencies }

  // The exact drift that put `3.86.0` in three places while package.json said
  // 3.88.0. A doc may name a version deliberately — "fixed upstream in 3.88.0"
  // is a fact about the past — so only the *pinned* form is checked: a package
  // quoted with a version that is neither the pinned one nor introduced by a
  // word like "at" or "since" is a claim about what this repo runs.
  it.each(docs)(
    '$name quotes the pinned version of each package',
    ({ text }) => {
      const wrong = [...text.matchAll(/`(@?[\w@/-]+)@(\d+\.\d+\.\d+)`/g)]
        .map((match) => ({
          full: match[0],
          name: match[1]!,
          version: match[2]!,
          before: text.slice(Math.max(0, match.index - 30), match.index),
        }))
        .filter(({ name }) => name in installed)
        .filter(
          ({ name, version }) =>
            installed[name]!.replace(/^[\^~]/, '') !== version,
        )
        // "at 3.86.0", "since 3.88.0", "was 3.86.0" are statements about history.
        .filter(
          ({ before }) =>
            !/\b(at|since|was|until|before|from|in)\s*$/i.test(before),
        )
        .map(({ full }) => full)

      expect(wrong).toEqual([])
    },
  )
})

describe('environment variables', () => {
  const example = readFileSync(join(root, '.env.example'), 'utf8')
  const documented = [...example.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map(
    (match) => match[1]!,
  )

  /** Set by the platform, the CI runner, or the deploy, never by `.env`. */
  const EXTERNAL = new Set([
    'CI',
    'GITHUB_ENV',
    'HOME',
    // Set by the Claude Code sandbox's agent proxy and its pre-installed
    // Playwright browsers when in use, never by .env — see
    // docs/SCREENSHOTS.md.
    'HTTPS_PROXY',
    'PLAYWRIGHT_BROWSERS_PATH',
    // Set by Next.js inside `instrumentation.ts`, not by anyone deploying this.
    'NEXT_RUNTIME',
    'NODE_ENV',
    'PATH',
    'PORT',
    'PWD',
    'TZ',
  ])

  it('documents every variable the code reads', () => {
    const read = new Set(
      [...sourceText.matchAll(/\bprocess\.env\.([A-Z][A-Z0-9_]*)/g)].map(
        (match) => match[1]!,
      ),
    )

    const undocumented = [...read].filter(
      (name) => !EXTERNAL.has(name) && !documented.includes(name),
    )

    expect(undocumented.sort()).toEqual([])
  })

  // The other direction, and the one that rots quietly: a variable that was
  // removed from the code but left in the example file is a setting an
  // operator will faithfully configure and wonder why it does nothing.
  it('reads every variable it documents', () => {
    const dead = documented.filter(
      (name) => !new RegExp(`\\b${name}\\b`).test(sourceText),
    )

    expect(dead.sort()).toEqual([])
  })
})

describe('reserved root slugs', () => {
  // A shared invariant in docs/AUTONOMOUS_WORKSTREAMS.md: a new root route must
  // reserve its first path segment before launch, or a migrated post can claim
  // the same URL and one of them silently wins. The list is maintained by hand,
  // which is exactly why it needs checking.
  const routeSegments = (dir: string): string[] => {
    if (!exists(dir)) return []
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => !name.startsWith('[') && !name.startsWith('_'))
  }

  const segments = [
    // Route groups are not path segments; their children are.
    ...routeSegments(join(root, 'app', '(frontend)')),
    ...routeSegments(join(root, 'app', '(payload)')),
    ...routeSegments(join(root, 'app')).filter((name) => !name.startsWith('(')),
  ].filter((name) => name !== 'components')

  it.each([...new Set(segments)])('reserves /%s', (segment) => {
    expect(RESERVED_ROOT_SLUGS as readonly string[]).toContain(segment)
  })
})
