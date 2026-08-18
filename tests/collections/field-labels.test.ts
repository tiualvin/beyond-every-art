// Payload builds a field's admin label from its name by splitting on capitals,
// so an initialism comes apart: `canonicalURL` renders as "Canonical U R L",
// `ghostID` as "Ghost I D", `legacyHTML` as "Legacy H T M L". The fix is a
// one-line explicit `label`, and the only hard part is noticing — the default
// is generated at render time, so nothing fails until an editor reads it.
//
// This test does the noticing. It asks Payload itself what label each field
// would get (`toWords`, the same helper the admin UI uses), and fails on any
// name whose default strands a letter unless the field declares a label that
// does not. Collections and globals are read off disk rather than listed here,
// so a new file is covered the day it lands.

import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { toWords } from 'payload'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')

/** A lone capital between spaces — "Canonical U R L" — is a split initialism. */
const STRANDED_LETTER = /(^|\s)[A-Z](?=\s|$)/

type NamedField = { name: string; label?: unknown }

type FieldContainer = {
  fields?: unknown
  tabs?: unknown
  blocks?: unknown
}

/**
 * Every named field in a config, descending through the containers that hold
 * other fields: `array`/`group`/`row`/`collapsible` carry `fields` directly,
 * `tabs` and `blocks` carry it one level down.
 */
function namedFields(fields: unknown): NamedField[] {
  if (!Array.isArray(fields)) return []

  return fields.flatMap((field: FieldContainer & Partial<NamedField>) => {
    const self = typeof field?.name === 'string' ? [field as NamedField] : []
    const nested = [
      ...namedFields(field?.fields),
      ...(Array.isArray(field?.tabs)
        ? field.tabs.flatMap((tab: FieldContainer) => namedFields(tab?.fields))
        : []),
      ...(Array.isArray(field?.blocks)
        ? field.blocks.flatMap((block: FieldContainer) =>
            namedFields(block?.fields),
          )
        : []),
    ]
    return [...self, ...nested]
  })
}

/** The label strings a field actually renders; `false` hides the label. */
function labelStrings(label: unknown): string[] {
  if (typeof label === 'string') return [label]
  if (label && typeof label === 'object') {
    return Object.values(label).filter(
      (value): value is string => typeof value === 'string',
    )
  }
  return []
}

async function configuredFields(): Promise<
  Array<{ source: string; field: NamedField }>
> {
  const found: Array<{ source: string; field: NamedField }> = []

  for (const dir of ['collections', 'globals']) {
    for (const file of readdirSync(resolve(root, dir))) {
      if (!file.endsWith('.ts')) continue

      const imported = (await import(resolve(root, dir, file))) as Record<
        string,
        unknown
      >

      for (const exported of Object.values(imported)) {
        const config = exported as FieldContainer & { slug?: string }
        if (!config || typeof config !== 'object') continue
        if (!Array.isArray(config.fields) || typeof config.slug !== 'string') {
          continue
        }

        for (const field of namedFields(config.fields)) {
          found.push({ source: `${dir}/${file}:${config.slug}`, field })
        }
      }
    }
  }

  return found
}

describe('Payload admin field labels', () => {
  it('never splits an initialism across the admin UI', async () => {
    const fields = await configuredFields()

    // Guards the discovery above: an empty walk would pass the loop silently.
    expect(fields.length).toBeGreaterThan(50)

    for (const { source, field } of fields) {
      const generated = toWords(field.name)
      if (!STRANDED_LETTER.test(generated)) continue

      const labels = labelStrings(field.label)
      expect(
        field.label === false || labels.length > 0,
        `${source}.${field.name} has no label, so the admin renders "${generated}"`,
      ).toBe(true)

      for (const label of labels) {
        expect(
          STRANDED_LETTER.test(label),
          `${source}.${field.name} label "${label}" splits an initialism`,
        ).toBe(false)
      }
    }
  })
})
