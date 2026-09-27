// The database schema must not depend on whether R2 is configured.
//
// `payload.config.ts` registers the S3 storage plugin in every environment and
// lets `enabled` follow S3_BUCKET and S3_ENDPOINT, so that the admin import map
// has one shape everywhere. The columns have to have one shape too, and that is
// the half nothing checked: from Payload 3.90 the plugin adds an `_objectKey`
// field only when it is enabled. CI's drift check runs without R2, so it saw no
// such column and generated no migration for it, while production — and
// browser-smoke, which configures placeholder R2 settings — selected it on
// every media query and failed.
//
// So the config is built both ways here and every column-bearing field is
// compared. A difference means one environment's migrations cannot serve the
// other, whichever way round it goes.

import type { Field } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'

const R2 = {
  S3_BUCKET: 'shape-test-bucket',
  S3_ENDPOINT: 'https://shape-test.invalid',
}

/** Dotted paths of every field that stores a value, nested ones included. */
function columns(fields: Field[], parent = ''): string[] {
  return fields.flatMap((field) => {
    if (field.type === 'ui') return []
    if (field.type === 'tabs') {
      return field.tabs.flatMap((tab) =>
        'name' in tab && tab.name
          ? columns(tab.fields, `${parent}${tab.name}.`)
          : columns(tab.fields, parent),
      )
    }
    if (!('name' in field)) {
      return 'fields' in field ? columns(field.fields, parent) : []
    }
    const path = `${parent}${field.name}`
    return 'fields' in field
      ? [path, ...columns(field.fields, `${path}.`)]
      : [path]
  })
}

async function uploadColumns(env: Record<string, string>) {
  vi.resetModules()
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value)
  const config = await (await import('../../payload.config')).default
  return Object.fromEntries(
    config.collections
      .filter((collection) => collection.upload)
      .map((collection) => [
        collection.slug,
        columns(collection.fields).sort(),
      ]),
  )
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('the storage plugin leaves the schema alone', () => {
  it('gives upload collections the same columns with R2 on and off', async () => {
    const off = await uploadColumns({ S3_BUCKET: '', S3_ENDPOINT: '' })
    const on = await uploadColumns(R2)
    expect(off).toEqual(on)
  })

  it('keeps the object key column either way', async () => {
    const off = await uploadColumns({ S3_BUCKET: '', S3_ENDPOINT: '' })
    expect(off.media).toContain('_objectKey')
  })
})
