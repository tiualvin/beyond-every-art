import config from '@payload-config'
import { getPayload, type Payload } from 'payload'

import { fixtures } from './fixtures'

type CreateOptions = Parameters<Payload['create']>[0]
type UpdateOptions = Parameters<Payload['update']>[0]

function assertSafeDatabase(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('The e2e seed refuses to run with NODE_ENV=production.')
  }

  const connection = process.env.DATABASE_URI
  if (!connection) throw new Error('DATABASE_URI is required for the e2e seed.')

  let hostname: string
  try {
    hostname = new URL(connection).hostname
  } catch {
    throw new Error('DATABASE_URI must be a valid PostgreSQL URL.')
  }

  // A Compose service named `postgres` can also be the production database;
  // only loopback is intrinsically safe. Remote/disposable CI networks must
  // opt in explicitly with E2E_ALLOW_REMOTE_SEED.
  const localHosts = new Set(['localhost', '127.0.0.1', '::1'])
  if (!localHosts.has(hostname) && process.env.E2E_ALLOW_REMOTE_SEED !== '1') {
    throw new Error(
      `Refusing to seed non-local database host ${hostname}. ` +
        'Set E2E_ALLOW_REMOTE_SEED=1 only for a disposable test database.',
    )
  }
}

/**
 * An app left unpublished. `pnpm seed:dev` supplies the published ones; this
 * is the counterpart the roadmap page must not show.
 */
async function upsertDraftApp(payload: Payload): Promise<void> {
  const data = {
    name: fixtures.draftApp.title,
    slug: fixtures.draftApp.slug,
    tagline: 'Synthetic draft, never visible to a reader.',
    summary: 'Seeded unpublished so the page and the route can be checked.',
    stage: 'concept',
    plate: 'reader',
    order: 99,
    _status: 'draft',
  }

  const existing = await payload.find({
    collection: 'apps',
    where: { slug: { equals: fixtures.draftApp.slug } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  if (existing.docs.length > 0) {
    await payload.update({
      collection: 'apps',
      id: existing.docs[0].id,
      data,
      draft: true,
      overrideAccess: true,
    } as unknown as UpdateOptions)
    return
  }

  await payload.create({
    collection: 'apps',
    data,
    draft: true,
    overrideAccess: true,
  } as unknown as CreateOptions)
}

async function upsertPost(
  payload: Payload,
  slug: string,
  data: Record<string, unknown>,
): Promise<void> {
  const existing = await payload.find({
    collection: 'posts',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    draft: true,
  })

  if (existing.docs[0]) {
    await payload.update({
      collection: 'posts',
      id: existing.docs[0].id,
      data,
      overrideAccess: true,
    } as unknown as UpdateOptions)
    return
  }

  await payload.create({
    collection: 'posts',
    data,
    overrideAccess: true,
  } as unknown as CreateOptions)
}

async function upsertRedirect(payload: Payload): Promise<void> {
  const { source, destination } = fixtures.redirect
  const existing = await payload.find({
    collection: 'redirects',
    where: { source: { equals: source } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const data = {
    source,
    destination,
    statusCode: '301',
    enabled: true,
    notes: 'Synthetic fixture for the Playwright browser smoke suite.',
  }

  if (existing.docs[0]) {
    await payload.update({
      collection: 'redirects',
      id: existing.docs[0].id,
      data,
      overrideAccess: true,
    } as unknown as UpdateOptions)
    return
  }

  await payload.create({
    collection: 'redirects',
    data,
    overrideAccess: true,
  } as unknown as CreateOptions)
}

/**
 * A user and an MCP key bound to it, for the endpoint smoke suite.
 *
 * Written through the Local API with `overrideAccess: true`, so the field
 * access that `adminIssuableApiKeys` governs in the admin panel does not apply
 * here — the seed is not the path being tested. What is being tested is that
 * the endpoint resolves the key, runs as this user, and lets `access/roles.ts`
 * decide the rest.
 *
 * `apiKeyIndex` is derived by Payload from `apiKey` and `PAYLOAD_SECRET` on
 * save, which is the same HMAC the plugin looks a presented bearer key up by —
 * so seeding the plaintext is enough to make the key work.
 */
async function upsertKeyedUser(
  payload: Payload,
  { email, key, role }: { email: string; key: string; role: string },
): Promise<void> {
  const existing = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  const user =
    existing.docs[0] ??
    (await payload.create({
      collection: 'users',
      data: {
        email,
        name: `E2E MCP ${role}`,
        password: fixtures.mcp.password,
        role,
      },
      overrideAccess: true,
    } as unknown as CreateOptions))

  const capabilities = {
    // Mirrors the plugin's allowlist in `lib/mcp/plugin.ts`. A capability the
    // config does not enable has no checkbox, so ticking it here would be a
    // field that does not exist.
    authors: { find: true },
    media: { find: true },
    posts: { create: true, find: true, update: true },
    tags: { find: true, update: true },
    // Custom tools default to enabled on a new key; set explicitly so the
    // suite does not depend on that default staying put.
    'payload-mcp-tool': {
      draftArticle: true,
      readArticleMarkdown: true,
      updateArticleMarkdown: true,
      uploadMedia: true,
      uploadMediaFromUrl: true,
    },
  }

  const keys = await payload.find({
    collection: 'payload-mcp-api-keys',
    where: { label: { equals: email } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  const data = {
    ...capabilities,
    apiKey: key,
    description: 'Synthetic key for the Playwright MCP endpoint suite.',
    enableAPIKey: true,
    label: email,
    user: user.id,
  }

  if (keys.docs[0]) {
    await payload.update({
      collection: 'payload-mcp-api-keys',
      id: keys.docs[0].id,
      data,
      overrideAccess: true,
    } as unknown as UpdateOptions)
    return
  }

  await payload.create({
    collection: 'payload-mcp-api-keys',
    data,
    overrideAccess: true,
  } as unknown as CreateOptions)
}

async function seed(): Promise<void> {
  assertSafeDatabase()
  const payload = await getPayload({ config })

  await upsertPost(payload, fixtures.draftPost.slug, {
    title: fixtures.draftPost.title,
    slug: fixtures.draftPost.slug,
    excerpt: 'Synthetic draft content that must never appear publicly.',
    legacyHTML:
      '<p>This draft is visible only through authenticated preview.</p>',
    visibility: 'public',
    _status: 'draft',
    ghostID: 'e2e-draft-post',
  })

  // The opening paragraph is deliberately longer than the teaser allowance, so
  // the second paragraph is always the withheld part no matter where the cut
  // lands. Both markers are distinctive enough to assert on anywhere.
  await upsertPost(payload, fixtures.privatePost.slug, {
    title: fixtures.privatePost.title,
    slug: fixtures.privatePost.slug,
    excerpt: 'Synthetic member content whose body is gated, not hidden.',
    legacyHTML:
      `<p>${fixtures.privatePost.teaserMarker}. Conservation notes open with a long passage about surface cleaning, consolidation, and the way a varnish yellows over the course of a century, written at length so that this opening paragraph on its own carries the teaser past the point where the rest of the body is withheld from a reader who is not yet a member, which is exactly the boundary that these browser tests exist to hold in place across the archive, the feed, the search results, and the post page itself.</p>` +
      `<p>${fixtures.privatePost.gatedMarker}.</p>`,
    visibility: 'members',
    publishedAt: '2025-02-01T09:00:00.000Z',
    _status: 'published',
    ghostID: 'e2e-private-post',
  })

  await upsertPost(payload, fixtures.duplicateTitlePost.slug, {
    title: fixtures.duplicateTitlePost.title,
    slug: fixtures.duplicateTitlePost.slug,
    excerpt: 'Synthetic post whose imported body repeats its own title.',
    legacyHTML:
      `<h1>${fixtures.duplicateTitlePost.title}</h1>` +
      '<p>The heading above came from Ghost and must not reach the page.</p>',
    visibility: 'public',
    publishedAt: '2025-02-02T09:00:00.000Z',
    _status: 'published',
    ghostID: 'e2e-duplicate-title-post',
  })

  await upsertDraftApp(payload)
  await upsertRedirect(payload)

  await upsertKeyedUser(payload, {
    email: fixtures.mcp.editorEmail,
    key: fixtures.mcp.editorKey,
    role: 'editor',
  })
  await upsertKeyedUser(payload, {
    email: fixtures.mcp.adminEmail,
    key: fixtures.mcp.adminKey,
    role: 'admin',
  })

  payload.logger.info(
    'E2E seed complete: draft, members post, duplicate-title post, ' +
      'draft app, redirect, MCP keys.',
  )
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('E2E seed failed:', error)
    process.exit(1)
  })
