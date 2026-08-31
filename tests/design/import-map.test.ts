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
  // The R2 upload handler, and the reason this list needs the note above it.
  //
  // `payload.config.ts` adds the S3 plugin only when `S3_BUCKET` and
  // `S3_ENDPOINT` are set, so a map generated on a machine without them is
  // complete for that machine and missing this key everywhere else. The map
  // was filled in on 16 Aug; R2 was configured on the server on 22 Aug; the
  // admin rendered blank from that day until 31 Aug, and the only symptom was
  // a `getFromImportMap` line in the container logs.
  //
  // **Regenerate with the S3 variables set**, or this comes back:
  //
  //   S3_BUCKET=x S3_ENDPOINT=https://x pnpm generate:importmap
  //
  // Placeholders are enough — the generator reads the config's shape, never
  // the bucket. The extra key is harmless where S3 is off: an unused entry in
  // a lookup table.
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
