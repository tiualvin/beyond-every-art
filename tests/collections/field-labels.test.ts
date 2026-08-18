// Payload derives a field's admin label from its name, and gets initialisms
// wrong in two different ways.
//
// It splits the name on capitals, so a capitalised initialism comes apart:
// `canonicalURL` renders as "Canonical U R L", `ghostID` as "Ghost I D",
// `legacyHTML` as "Legacy H T M L". And it title-cases what is left, so a
// lowercase one is quietly downcased instead: `url` renders as "Url".
//
// Both are fixed by an explicit `label`, and the only hard part is noticing —
// the default is generated at render time, so nothing fails until an editor
// reads it.
//
// This test does the noticing. It asks Payload itself what each field would
// render (`toWords`, the helper the admin UI calls), falls back to that when no
// label is declared, and holds the result to two rules:
//
//   1. No stranded single letters. Catches the split, including initialisms
//      nobody has registered below — `legacyXML` would fail on the day it
//      landed.
//   2. Every initialism in the name survives as one uppercase word. Catches
//      "Url", which rule 1 cannot see because nothing is stranded.
//
// Collections, globals and blocks are read off disk rather than listed here, so
// a new file is covered the day it lands.

import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { toWords } from 'payload'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')

/** Directories holding field configs. Every `.ts` file in them is scanned. */
const SOURCES = ['collections', 'globals', 'blocks']

/** Initialisms this project writes into field names. Extend as they appear. */
const INITIALISMS = ['URL', 'ID', 'HTML']

/** A lone capital between spaces — "Canonical U R L" — is a split initialism. */
const STRANDED_LETTER = /(^|\s)[A-Z](?=\s|$)/

/** `stripeCustomerID` → `['stripe', 'Customer', 'ID']`, runs of caps intact. */
const NAME_SEGMENT = /[A-Z]+(?![a-z])|[A-Z]?[a-z]+|\d+/g

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

/** The initialisms a field name contains, as whole camelCase segments. */
function initialismsIn(name: string): string[] {
  const segments = name.match(NAME_SEGMENT) ?? []
  return INITIALISMS.filter((initialism) =>
    segments.some((segment) => segment.toUpperCase() === initialism),
  )
}

/**
 * The label strings a field actually renders. An explicit `label` wins; without
 * one Payload generates the label, and that generated text is what an editor
 * reads, so it is what gets checked.
 */
function renderedLabels(field: NamedField): string[] {
  const { label } = field
  if (label === false) return [] // Deliberately unlabelled; nothing renders.
  if (typeof label === 'string') return [label]
  if (label && typeof label === 'object') {
    return Object.values(label).filter(
      (value): value is string => typeof value === 'string',
    )
  }
  return [toWords(field.name)]
}

async function configuredFields(): Promise<
  Array<{ source: string; field: NamedField }>
> {
  const found: Array<{ source: string; field: NamedField }> = []

  for (const dir of SOURCES) {
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
  it('renders every initialism as one uppercase word', async () => {
    const fields = await configuredFields()

    // Guards the discovery above: an empty walk would pass the loop silently.
    expect(fields.length).toBeGreaterThan(50)

    for (const { source, field } of fields) {
      const where = `${source}.${field.name}`

      for (const label of renderedLabels(field)) {
        const rendered = `renders as "${label}"; set an explicit label`

        expect(
          STRANDED_LETTER.test(label),
          `${where} ${rendered} — an initialism is split apart`,
        ).toBe(false)

        for (const initialism of initialismsIn(field.name)) {
          expect(
            new RegExp(`\\b${initialism}\\b`).test(label),
            `${where} ${rendered} — ${initialism} is not written as ${initialism}`,
          ).toBe(true)
        }
      }
    }
  })
})
