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

/** Every `'<module>#<Export>'` key the map registers. */
const keys = [...source.matchAll(/['"]([^'"]+#[A-Za-z]+)['"]\s*:/g)].map(
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
    const bound = [
      ...source.matchAll(/['"][^'"]+#[A-Za-z]+['"]:\s*(\w+)/g),
    ].map((m) => m[1]!)

    expect(bound.length).toBe(keys.length)
    for (const identifier of bound) expect(imported).toContain(identifier)
  })
})
