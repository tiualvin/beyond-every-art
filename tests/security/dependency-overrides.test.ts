import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Why each `pnpm.overrides` entry exists, and the version that answers it.
 *
 * Every one is a transitive dependency: `next` and `payload` are both already
 * the latest release of their line, so the advisories against what they pull in
 * cannot be closed by upgrading them. An override is the only lever, and an
 * override with no recorded reason is impossible to retire safely — nobody can
 * tell whether it is load-bearing or left over. So the reason lives here, next
 * to the assertion that it still holds.
 *
 * Removing one: when the package that pulls the vulnerable version ships a
 * release that requires the patched one, delete the override and this entry,
 * reinstall, and confirm `pnpm audit --prod` stays clean.
 */
const OVERRIDES: Record<string, { floor: string; reason: string }> = {
  '@esbuild-kit/core-utils>esbuild': {
    floor: '0.25.0',
    reason:
      'esbuild dev-server request forgery, reached through drizzle-kit’s ' +
      'deprecated @esbuild-kit loader. Scoped to that path so the current ' +
      'esbuild elsewhere in the tree is left alone.',
  },
  dompurify: {
    floor: '3.4.13',
    reason:
      'ALLOWED_ATTR pollution and a detached-subtree escape, via ' +
      '@payloadcms/next. Sanitiser bugs reach the admin panel.',
  },
  'fast-uri': {
    floor: '3.1.6',
    reason:
      'Host confusion via backslash authority, plus four more high-severity ' +
      'fast-uri advisories (IDN canonicalization, IPv6 SSRF, hostname ' +
      'percent-decoding SSRF, percent-encoded scheme host confusion) all ' +
      'fixed in 3.1.6, via @payloadcms/plugin-mcp.',
  },
  hono: {
    floor: '4.12.34',
    reason:
      'ReDoS in CORS middleware, SSR output retained across requests, and a ' +
      'language-middleware complexity attack. Reached through the MCP SDK, ' +
      'which serves /api/mcp.',
  },
  'js-yaml': {
    floor: '4.3.1',
    reason: 'Quadratic CPU consumption resolving !!omap, via payload.',
  },
  nanoid: {
    floor: '3.3.18',
    reason:
      'Custom generators loop indefinitely on a non-integer size, via next.',
  },
  postcss: {
    floor: '8.5.23',
    reason:
      'Path traversal in source-map auto-loading, arbitrary file read, and ' +
      'XSS through unescaped </style>. Via next, at build time.',
  },
  sharp: {
    floor: '0.35.3',
    reason:
      'Inherited libvips vulnerabilities. The project depends on sharp ' +
      'directly at this version already; next pulled an older copy alongside ' +
      'it, so the override aligns the tree on the one that is actually used.',
  },
}

const root = resolve(import.meta.dirname, '../..')

const packageJson = JSON.parse(
  readFileSync(resolve(root, 'package.json'), 'utf8'),
) as { pnpm?: { overrides?: Record<string, string> } }

const lockfile = readFileSync(resolve(root, 'pnpm-lock.yaml'), 'utf8')

/** Numeric comparison, because `0.9.0` sorts above `0.10.0` as a string. */
function isAtLeast(version: string, floor: string): boolean {
  const parse = (value: string) =>
    value.split('.').map((part) => Number.parseInt(part, 10) || 0)
  const [a, b] = [parse(version), parse(floor)]

  for (let index = 0; index < 3; index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0))
      return (a[index] ?? 0) > (b[index] ?? 0)
  }
  return true
}

/** Every version of `name` the lockfile actually resolved. */
function resolvedVersions(name: string): string[] {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const matches = lockfile.matchAll(
    new RegExp(`^ {2}'?${escaped}@(\\d+\\.\\d+\\.\\d+)`, 'gm'),
  )
  return [...new Set([...matches].map((match) => match[1]!))]
}

describe('pnpm overrides', () => {
  const configured = packageJson.pnpm?.overrides ?? {}

  it('documents every override it applies', () => {
    expect(Object.keys(configured).sort()).toEqual(
      Object.keys(OVERRIDES).sort(),
    )
  })

  // pnpm writes the overrides it installed with into the lockfile. If the two
  // disagree, someone edited package.json without reinstalling, and the tree CI
  // builds is not the tree that was reviewed.
  it('has been installed, not just declared', () => {
    for (const [name, range] of Object.entries(configured)) {
      const quoted = name.includes('>') ? `'${name}'` : name
      expect(lockfile).toContain(`\n  ${quoted}: ${range}`)
    }
  })

  it.each(Object.entries(OVERRIDES))(
    'holds %s above its advisory floor',
    (name, { floor }) => {
      const target = name.includes('>') ? name.split('>').at(-1)! : name
      const versions = resolvedVersions(target)

      expect(versions.length).toBeGreaterThan(0)
      for (const version of versions) {
        expect(
          isAtLeast(version, floor),
          `${target}@${version} is below the ${floor} this override exists to enforce`,
        ).toBe(true)
      }
    },
  )
})
