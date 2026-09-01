// The admin import map has to stay populated.
//
// `app/(payload)/admin/importMap.ts` is what `app/(payload)/layout.tsx` and the
// admin page hand to Payload. When a component the config asks for is missing
// from it, Payload skips rendering that component — no console error, no failed
// network request, just absent UI. The dashboard shipped blank that way, with
// the file sitting at `export const importMap = {}`.
//
// Payload regenerates it with `pnpm generate:importmap`, which writes a
// gitignored `importMap.js` sibling that has to be copied over the tracked
// `.ts`. Nothing enforces that copy, which is the gap these assertions cover.
//
// This deliberately does not diff against a freshly generated map: doing that
// needs a Payload boot, and the generator turned out to write nothing at all
// under CI's conditions while working locally — a gate that silently compares
// two empty sets is worse than none. So the file is checked for the properties
// that actually broke, and `REQUIRED` grows whenever a feature is added whose
// absence would be invisible.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  resolve(import.meta.dirname, '../../app/(payload)/admin/importMap.ts'),
  'utf8',
)

/**
 * Every `'<module>#<Export>'` key the map registers.
 *
 * `[A-Za-z0-9_]` rather than `[A-Za-z]`: the first version of this could not
 * see `S3ClientUploadHandler`, because of the digit. So the one key whose
 * absence actually broke the admin was invisible to the assertions written to
 * catch exactly that, and a `REQUIRED` entry for it would have failed even
 * once the map was correct.
 */
const keys = [...source.matchAll(/['"]([^'"]+#[A-Za-z0-9_]+)['"]\s*:/g)].map(
  (match) => match[1]!,
)

const REQUIRED = [
  // Payload's default dashboard widget. Its absence is the blank dashboard:
  // the lookup fails, the cards are skipped, and nothing reports it.
  '@payloadcms/next/rsc#CollectionCards',
  // The insertable modules. A map regenerated before those blocks existed
  // still fixes the dashboard, so this is the half a stale copy would drop.
  '@payloadcms/richtext-lexical/client#BlocksFeatureClient',
  // The server entries the editor field itself renders through.
  '@payloadcms/richtext-lexical/rsc#RscEntryLexicalField',
  '@payloadcms/richtext-lexical/rsc#RscEntryLexicalCell',
  // The R2 upload handler. The map was filled in on 16 Aug, R2 was configured
  // on the server on 22 Aug, and the admin rendered blank from that day until
  // 31 Aug — `/admin` answering 200 with a correct RSC payload and an empty
  // screen, no console error and no failed request, the only symptom a
  // `getFromImportMap` line in the container logs. Every status- and
  // header-level check in this repository passed against it.
  //
  // `payload.config.ts` now registers `s3Storage` unconditionally with
  // `enabled: useR2`, so the config's shape — and therefore this map — no
  // longer changes with the environment, and regenerating on a machine without
  // R2 credentials can no longer drop this key. That is what keeps the entry
  // present; this assertion is what notices if it ever goes missing again.
  '@payloadcms/storage-s3/client#S3ClientUploadHandler',
]

describe('admin import map', () => {
  it('is not the empty object that blanked the dashboard', () => {
    expect(source).not.toMatch(/export const importMap = \{\s*\}/)
    expect(keys.length).toBeGreaterThan(20)
  })

  it.each(REQUIRED)('registers %s', (key) => {
    expect(keys).toContain(key)
  })

  it('binds every key to an identifier it actually imported', () => {
    const imported = new Set(
      [...source.matchAll(/import \{ \w+ as (\w+) \}/g)].map((m) => m[1]!),
    )
    // Same `[A-Za-z0-9_]` as `keys` above, and for the same reason — and
    // `\s*` has to cross a newline, because Prettier puts a long key's value
    // on the line below it.
    const bound = [
      ...source.matchAll(/['"][^'"]+#[A-Za-z0-9_]+['"]:\s*(\w+)/g),
    ].map((m) => m[1]!)

    expect(bound.length).toBe(keys.length)
    for (const identifier of bound) expect(imported).toContain(identifier)
  })
})

describe('the generated import map cannot shadow the tracked one', () => {
  // Every assertion above reads `importMap.ts`. The admin page imports
  // `./admin/importMap` without an extension, and webpack resolves `.js`
  // first — so a generated `importMap.js` sitting beside it is what actually
  // gets compiled, and this whole file passes while the build ignores the file
  // it just checked.
  //
  // That is what kept the admin panel blank for ten days. The tracked map was
  // correct and merged; a stale generated sibling left on the server from an
  // earlier `pnpm generate:importmap` shadowed it, so every build — including a
  // full `--no-cache` rebuild — compiled a map with no `S3ClientUploadHandler`
  // in it. Confirmed by building both ways: present, and the component is in no
  // client chunk; absent, and it is there.
  //
  // `.dockerignore` is what makes the image immune, so that is what this
  // asserts. `.gitignore` keeps it out of commits, which is a different
  // guarantee and was never the one that failed.
  const dockerignore = readFileSync(
    resolve(import.meta.dirname, '../../.dockerignore'),
    'utf8',
  )

  it('is excluded from the Docker build context', () => {
    const entries = dockerignore
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))

    expect(entries).toContain('app/(payload)/admin/importMap.js')
  })
})
