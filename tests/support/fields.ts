// Finding a field in a collection, wherever the edit view happens to put it.
//
// Several tests assert things about a field that have nothing to do with where
// it is drawn — that `ghostURL` is staff-only, that `legacyHTML` refuses an
// author, that `metaTitle` comes from the shared helper. They all looked the
// field up with `fields.find(...)` over the top level, so arranging Posts and
// Pages into tabs broke five of them at once while every invariant they guard
// still held.
//
// A test that fails when a field moves is a test that will be "fixed" by
// deleting it. This walks the containers Payload nests fields in instead, so
// the assertions survive a layout change and still fail if the field itself
// loses its access rule.

import type { Field } from 'payload'

type Container = { fields?: Field[]; tabs?: Array<{ fields?: Field[] }> }

/** Every field in a collection, flattened out of tabs, rows and groups. */
export function flattenFields(fields: Field[]): Field[] {
  const out: Field[] = []
  for (const field of fields) {
    out.push(field)
    const container = field as Container
    if (Array.isArray(container.fields)) {
      out.push(...flattenFields(container.fields))
    }
    for (const tab of container.tabs ?? []) {
      if (Array.isArray(tab.fields)) out.push(...flattenFields(tab.fields))
    }
  }
  return out
}

/** One named field, at any depth. */
export function findField(fields: Field[], name: string): Field | undefined {
  return flattenFields(fields).find(
    (field) => 'name' in field && field.name === name,
  )
}
