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

  await upsertPost(payload, fixtures.privatePost.slug, {
    title: fixtures.privatePost.title,
    slug: fixtures.privatePost.slug,
    excerpt: 'Synthetic member content that must never appear publicly.',
    legacyHTML:
      '<p>This article remains available only to editorial staff.</p>',
    visibility: 'members',
    publishedAt: '2025-02-01T09:00:00.000Z',
    _status: 'published',
    ghostID: 'e2e-private-post',
  })

  await upsertRedirect(payload)
  payload.logger.info('E2E seed complete: draft, private post, and redirect.')
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('E2E seed failed:', error)
    process.exit(1)
  })
