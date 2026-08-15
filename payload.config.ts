import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import path from 'node:path'
import { buildConfig } from 'payload'
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'

import { AppWaitlist } from './collections/AppWaitlist'
import { Apps } from './collections/Apps'
import { Authors } from './collections/Authors'
import { BillingEvents } from './collections/BillingEvents'
import { Media } from './collections/Media'
import { Members } from './collections/Members'
import { NewsletterSignups } from './collections/NewsletterSignups'
import { Pages } from './collections/Pages'
import { Posts } from './collections/Posts'
import { Redirects } from './collections/Redirects'
import { Tags } from './collections/Tags'
import { Users } from './collections/Users'
import { Footer } from './globals/Footer'
import { Header } from './globals/Header'
import { SiteSettings } from './globals/SiteSettings'
import { resendAdapter } from './lib/email/resend'
import { mcp } from './lib/mcp/plugin'
import {
  buildPreviewUrl,
  PREVIEW_COLLECTIONS,
} from './lib/preview/live-preview'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)
const useR2 = Boolean(process.env.S3_BUCKET && process.env.S3_ENDPOINT)
const email = resendAdapter()

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: { baseDir: path.resolve(dirname) },
    // Live Preview renders the real frontend in an iframe beside the editor.
    // Breakpoints match the widths the visual direction and the Playwright
    // projects already use, so what an editor checks is what is tested.
    livePreview: {
      breakpoints: [
        { name: 'mobile', label: 'Mobile', width: 375, height: 667 },
        { name: 'tablet', label: 'Tablet', width: 768, height: 1024 },
        { name: 'desktop', label: 'Desktop', width: 1440, height: 900 },
      ],
      collections: [...PREVIEW_COLLECTIONS],
      url: ({ collectionConfig, data }) =>
        buildPreviewUrl({
          collection: collectionConfig?.slug,
          slug: data?.slug,
          live: true,
        }),
    },
  },
  collections: [
    Users,
    Authors,
    Tags,
    Media,
    Posts,
    Pages,
    Apps,
    AppWaitlist,
    Redirects,
    Members,
    NewsletterSignups,
    BillingEvents,
  ],
  // Schema changes ship as reviewed SQL in `migrations/`, never as an implicit
  // push. `push` defaults to on outside production, which would let a developer
  // machine and CI silently reshape their own databases from the config while
  // production — where push is off — waited for a migration nobody wrote. That
  // divergence is invisible until a deploy fails against real data, so the
  // safer trade is to make every environment take the same path: generate a
  // migration with `pnpm migrate:db:create`, review the SQL, commit it.
  db: postgresAdapter({
    migrationDir: path.resolve(dirname, 'migrations'),
    pool: { connectionString: process.env.DATABASE_URI },
    push: false,
  }),
  editor: lexicalEditor(),
  // Payload's default is 10, and `?depth=10` on a public collection endpoint is
  // a very cheap request that makes the server populate ten levels of
  // relationships before it can answer. Nothing in this repo reads deeper than
  // 2 (the frontend passes 0 or 1 almost everywhere), so 3 leaves real queries
  // untouched and removes the amplification. Requests asking for more are
  // served at this depth rather than rejected.
  maxDepth: 3,
  // Transactional email (admin password reset, verification). Omitted when
  // RESEND_API_KEY / EMAIL_FROM_ADDRESS are unset so local dev and CI still boot.
  ...(email ? { email } : {}),
  globals: [SiteSettings, Header, Footer],
  plugins: [
    // Always registered: the plugin keeps its API-key collection when disabled,
    // so the database schema does not change with MCP_ENABLED. Whether the
    // endpoint is mounted is decided inside.
    mcp(),
    ...(useR2
      ? [
          s3Storage({
            bucket: process.env.S3_BUCKET!,
            collections: { media: true },
            config: {
              credentials: {
                accessKeyId: process.env.S3_ACCESS_KEY_ID!,
                secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
              },
              endpoint: process.env.S3_ENDPOINT,
              region: process.env.S3_REGION || 'auto',
            },
          }),
        ]
      : []),
  ],
  secret: process.env.PAYLOAD_SECRET || '',
  sharp,
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
})
