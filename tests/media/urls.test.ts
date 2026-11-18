import type { Field, FieldHook, SanitizedConfig } from 'payload'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import payloadConfig from '../../payload.config'
import { deslashStoredUrl, stripTrailingSlashes } from '../../lib/media/urls'

// A stored media URL must never end in a slash (lib/media/urls.ts has why).
// These run the Media collection's real, merged field hooks the way Payload's
// update runs them — in order, each seeing the last one's value — with
// NEXT_TRAILING_SLASH set as Next.js sets it inside the server. The collection
// hook this replaced passed its own unit tests for months while every save
// stored the slash, because it ran before the hook that added it.

type Named = Field & {
  name: string
  fields?: Field[]
  hooks?: { beforeChange?: FieldHook[] }
}

const byName = (fields: Field[] | undefined, name: string): Named => {
  const field = (fields ?? []).find(
    (candidate) => 'name' in candidate && candidate.name === name,
  )
  expect(field, `no field named ${name}`).toBeDefined()
  return field as Named
}

let config: SanitizedConfig
let fields: Field[]
let sizeNames: string[]
const previous = process.env.NEXT_TRAILING_SLASH

beforeEach(async () => {
  config = await payloadConfig
  const media = config.collections.find((c) => c.slug === 'media')!
  fields = media.fields
  sizeNames = (media.upload.imageSizes ?? []).map((size) => size.name)
  process.env.NEXT_TRAILING_SLASH = 'true'
})

afterEach(() => {
  if (previous === undefined) delete process.env.NEXT_TRAILING_SLASH
  else process.env.NEXT_TRAILING_SLASH = previous
})

/** Payload's sequence: every hook in order, a returned value replacing the last. */
async function stored(
  field: Named,
  data: Record<string, unknown>,
  upTo?: number,
) {
  const hooks = (field.hooks?.beforeChange ?? []).slice(0, upTo)
  let value: unknown = undefined
  for (const hook of hooks) {
    const next = await hook({
      collection: config.collections.find((c) => c.slug === 'media'),
      data,
      operation: 'update',
      originalDoc: data,
      req: { payload: { config } },
      siblingData: {},
      value,
    } as unknown as Parameters<FieldHook>[0])
    if (next !== undefined) value = next
  }
  return value
}

const original = { filename: 'ultramarine.jpg' }
const withSizes = (name: string) => ({
  filename: 'ultramarine.jpg',
  sizes: { [name]: { filename: `ultramarine-${name}.jpg` } },
})

describe('stored media URLs', () => {
  it("are given a trailing slash by Payload's own hook — the reason this exists", async () => {
    expect(await stored(byName(fields, 'url'), original, 1)).toBe(
      '/api/media/file/ultramarine.jpg/',
    )
  })

  it('are stored without one for the original', async () => {
    expect(await stored(byName(fields, 'url'), original)).toBe(
      '/api/media/file/ultramarine.jpg',
    )
  })

  it('are stored without one for every image size', async () => {
    expect(sizeNames.length).toBeGreaterThan(0)
    const sizes = byName(fields, 'sizes')
    for (const name of sizeNames) {
      const url = byName(byName(sizes.fields, name).fields, 'url')
      expect(await stored(url, withSizes(name)), name).toBe(
        `/api/media/file/ultramarine-${name}.jpg`,
      )
    }
  })

  it('are deslashed by the last hook on each URL field, after Payload has run', () => {
    const sizes = byName(fields, 'sizes')
    const urlFields = [
      byName(fields, 'url'),
      ...sizeNames.map((name) =>
        byName(byName(sizes.fields, name).fields, 'url'),
      ),
    ]
    for (const field of urlFields) {
      const hooks = field.hooks?.beforeChange ?? []
      expect(hooks.length).toBeGreaterThan(1)
      expect(hooks.at(-1)).toBe(deslashStoredUrl)
    }
  })
})

describe('stripTrailingSlashes', () => {
  it('removes every trailing slash and nothing else', () => {
    expect(stripTrailingSlashes('/api/media/file/x.png/')).toBe(
      '/api/media/file/x.png',
    )
    expect(stripTrailingSlashes('/api/media/file/x.png//')).toBe(
      '/api/media/file/x.png',
    )
    expect(stripTrailingSlashes('/api/media/file/x.png')).toBe(
      '/api/media/file/x.png',
    )
  })

  it('leaves a field with no URL yet alone', () => {
    const args = { value: null } as unknown as Parameters<FieldHook>[0]
    expect(deslashStoredUrl(args)).toBeNull()
  })
})
