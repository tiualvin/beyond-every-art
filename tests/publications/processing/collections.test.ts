import type { Field } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  publicationPageImagesRead,
  publicationPageImagesReadFor,
} from '../../../access/publications'
import { editorsAndAdmins } from '../../../access/roles'
import {
  PAGE_IMAGE_PREFIX,
  pageImageCacheControl,
  PublicationPageImages,
} from '../../../collections/PublicationPageImages'
import { PublicationPages } from '../../../collections/PublicationPages'
import { PublicationRuns } from '../../../collections/PublicationRuns'
import { Publications } from '../../../collections/Publications'
import {
  ACTIVE_STATUSES,
  RENDITION,
} from '../../../lib/publications/processing/plan'
import { removeProcessingOnDelete } from '../../../lib/publications/processing/store'

const anonymous = { user: null }
const author = { user: { id: 3, role: 'author' } }
const editor = { user: { id: 2, role: 'editor' } }

const read = (
  rule: ReturnType<typeof publicationPageImagesReadFor>,
  req: object,
  isReadingStaticFile = false,
) => rule({ req, isReadingStaticFile } as never)

describe('page images, before launch', () => {
  const rule = publicationPageImagesReadFor(false)

  it('serves nothing to anyone but editors, files included', async () => {
    expect(await read(rule, anonymous, true)).toBe(false)
    expect(await read(rule, author, true)).toBe(false)
    expect(await read(rule, anonymous)).toBe(false)
  })

  it('lets editors see them, in the admin and in preview', async () => {
    expect(await read(rule, editor, true)).toBe(true)
    expect(await read(rule, editor)).toBe(true)
  })

  it('tells caches to keep no copy', () => {
    // Only an editor can fetch one now, and the CMS hostname is proxied too.
    expect(pageImageCacheControl(false)).toBe('private, no-store')
    const headers =
      PublicationPageImages.upload &&
      typeof PublicationPageImages.upload === 'object' &&
      PublicationPageImages.upload.modifyResponseHeaders?.({
        headers: new Headers(),
      })
    expect(headers && headers.get('Cache-Control')).toBe('private, no-store')
  })
})

describe('page images, after launch', () => {
  const rule = publicationPageImagesReadFor(true)

  it('serves a file to anyone holding its URL', async () => {
    expect(await read(rule, anonymous, true)).toBe(true)
  })

  it('keeps the listing — every name at once — to editors', async () => {
    expect(await read(rule, anonymous)).toBe(false)
    expect(await read(rule, author)).toBe(false)
    expect(await read(rule, editor)).toBe(true)
  })

  it('lets a file be cached for a year, because its name is its content', () => {
    expect(pageImageCacheControl(true)).toBe(
      'public, max-age=31536000, immutable',
    )
  })
})

describe('the processing collections', () => {
  it('read page images through the launch-aware rule', () => {
    expect(PublicationPageImages.access?.read).toBe(publicationPageImagesRead)
  })

  it('refuse every write that does not override access', async () => {
    for (const collection of [
      PublicationPageImages,
      PublicationPages,
      PublicationRuns,
    ]) {
      expect(
        await collection.access?.create?.({ req: editor } as never),
        collection.slug,
      ).toBe(false)
      expect(
        await collection.access?.update?.({ req: editor } as never),
        collection.slug,
      ).toBe(false)
    }
  })

  it('keep pages and runs to editors, through the API too', () => {
    // The reader renders on the server; nothing public needs these, and an
    // unpublished issue's text is what they would give away.
    expect(PublicationPages.access?.read).toBe(editorsAndAdmins)
    expect(PublicationRuns.access?.read).toBe(editorsAndAdmins)
  })

  it('accept WebP only, in the sizes the rendition names', () => {
    const upload = PublicationPageImages.upload as Exclude<
      typeof PublicationPageImages.upload,
      boolean | undefined
    >
    expect(upload.mimeTypes).toEqual(['image/webp'])
    expect(upload.imageSizes?.map((size) => [size.name, size.width])).toEqual(
      RENDITION.sizes.map((size) => [size.name, size.width]),
    )
  })

  it('allow one record per page of an issue', () => {
    expect(PublicationPages.indexes).toContainEqual({
      fields: ['publication', 'pageNumber'],
      unique: true,
    })
  })

  it('offer every status a run can be in', () => {
    const status = PublicationRuns.fields.find(
      (field) => 'name' in field && field.name === 'status',
    ) as Extract<Field, { type: 'select' }>
    const values = status.options.map((option) =>
      typeof option === 'string' ? option : option.value,
    )
    expect(values.sort()).toEqual(
      [...ACTIVE_STATUSES, 'failed', 'ready'].sort(),
    )
  })

  it('clear an issue’s processed records when it is deleted for good', () => {
    expect(Publications.hooks?.beforeDelete).toContain(removeProcessingOnDelete)
  })
})

describe('page images in R2', { timeout: 30_000 }, () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('live under their own prefix, at URLs with no query string', async () => {
    vi.resetModules()
    vi.stubEnv('S3_BUCKET', 'collections-test-bucket')
    vi.stubEnv('S3_ENDPOINT', 'https://collections-test.invalid')
    const config = await (await import('../../../payload.config')).default
    const collection = config.collections.find(
      (each) => each.slug === 'publication-page-images',
    )!
    const fields = collection.fields as Array<Field & { name?: string }>

    const prefix = fields.find((field) => field.name === 'prefix') as {
      defaultValue?: unknown
    }
    // Apart from media's objects, which sit at the bucket root.
    expect(prefix.defaultValue).toBe(PAGE_IMAGE_PREFIX)

    // A prefixed collection otherwise appends `?prefix=` to every file URL.
    const url = fields.find((field) => field.name === 'url') as {
      hooks?: { afterRead?: Array<(args: object) => unknown> }
    }
    // Every hook on the field, in order, as Payload runs them on a read:
    // the storage plugin's, then Payload's own, which rebuilds a relative URL
    // from the file name.
    const hooks = url.hooks?.afterRead ?? []
    expect(hooks.length).toBeGreaterThan(0)
    const data = { filename: 'abc.webp', prefix: PAGE_IMAGE_PREFIX }
    let value: unknown = '/api/publication-page-images/file/abc.webp'
    for (const hook of hooks) {
      value = await hook({
        data,
        originalDoc: data,
        value,
        req: { payload: { config } },
      })
    }
    expect(value).toBe('/api/publication-page-images/file/abc.webp')
  })
})
