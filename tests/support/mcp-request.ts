// A `req` the MCP tool handlers can run against, without a database.
//
// The handlers convert Markdown against the editor attached to the real
// `content` field, and that editor only works once Payload has sanitized the
// config — an unsanitized `lexicalEditor()` is a provider function with no
// features resolved, so a conversion against it fails. So the config is built
// for real, with the real `Posts` collection, and only the database calls are
// stubbed: `findByID`, `find` and `update` are spies over one stored document.
//
// Built once per test file and shared, because sanitizing the editor is the
// slow part and nothing in it varies between tests.

import { buildConfig, type Payload, type PayloadRequest } from 'payload'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { vi } from 'vitest'

import { Posts } from '../../collections/Posts'

type Doc = Record<string, unknown> & { id: number | string }

let collections: Promise<Payload['collections']> | undefined

function sanitizedCollections(): Promise<Payload['collections']> {
  collections ??= buildConfig({
    secret: 'test-only',
    db: {} as never,
    editor: lexicalEditor(),
    collections: [
      Posts,
      // Present only so the relationships in Posts, and the upload and
      // relationship fields inside its blocks, point somewhere.
      { slug: 'authors', fields: [] },
      { slug: 'tags', fields: [] },
      { slug: 'users', auth: true, fields: [] },
      { slug: 'media', upload: true, fields: [] },
      { slug: 'signup-campaigns', fields: [] },
    ],
  }).then(
    (config) =>
      Object.fromEntries(
        config.collections.map((collection) => [
          collection.slug,
          { config: collection },
        ]),
      ) as unknown as Payload['collections'],
  )
  return collections
}

/**
 * A request whose Payload holds `doc` and records every write to it.
 *
 * `update` merges the written data into the stored document, so a test can
 * call one tool after another and see the second read what the first wrote.
 */
export async function mcpRequest(initial: Doc) {
  let doc: Doc = { ...initial }

  const payload = {
    collections: await sanitizedCollections(),
    findByID: vi.fn(async () => doc),
    find: vi.fn(async () => ({ docs: [doc] })),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      doc = { ...doc, ...data }
      return doc
    }),
  }

  const req = {
    payload,
    user: { id: 1, collection: 'users', role: 'editor' },
  } as unknown as PayloadRequest

  return { req, payload, current: () => doc }
}
