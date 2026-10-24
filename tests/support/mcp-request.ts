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
 * `posts` are other articles, found by slug — the live rows a link check
 * reads. A slug that is neither one of them nor `doc`'s finds nothing. `role`
 * is the key's user's role, an editor unless a test says otherwise. `media`
 * is the Media library, found by filename — what a conversion maps images to.
 *
 * `update` merges the written data into the stored document, so a test can
 * call one tool after another and see the second read what the first wrote.
 *
 * Two copies are kept, as Payload keeps them: the newest version, which every
 * read sees unless it asks for `draft: false`, and the live row, which only a
 * write without `draft` reaches. A draft saved over a published article leaves
 * the live row as it was — the difference the tools now report on.
 */
export async function mcpRequest(
  initial: Doc,
  {
    posts = [],
    role = 'editor',
    media = [],
  }: { posts?: Doc[]; role?: string; media?: Doc[] } = {},
) {
  let doc: Doc = { ...initial }
  let live: Doc = { ...initial }

  const payload = {
    collections: await sanitizedCollections(),
    findByID: vi.fn(async () => doc),
    find: vi.fn(
      async (args?: {
        collection?: string
        draft?: boolean
        where?: {
          slug?: { equals?: unknown }
          filename?: { in?: unknown[] }
        }
      }) => {
        if (args?.collection === 'media') {
          const names = args.where?.filename?.in ?? []
          return {
            docs: media.filter((item) => names.includes(item.filename)),
          }
        }
        const slug = args?.where?.slug?.equals
        const other = posts.find((post) => post.slug === slug)
        if (other) return { docs: [other] }
        if (posts.length && slug !== undefined && slug !== doc.slug) {
          return { docs: [] }
        }
        return { docs: [args?.draft === false ? live : doc] }
      },
    ),
    findVersions: vi.fn(async () => ({
      docs: [{ id: 'version-before', parent: doc.id }],
    })),
    update: vi.fn(
      async ({
        data,
        draft,
      }: {
        data: Record<string, unknown>
        draft?: boolean
      }) => {
        doc = { ...doc, ...data }
        if (!draft) live = { ...doc }
        return doc
      },
    ),
  }

  const req = {
    payload,
    user: { id: 1, collection: 'users', role },
  } as unknown as PayloadRequest

  return { req, payload, current: () => doc }
}
