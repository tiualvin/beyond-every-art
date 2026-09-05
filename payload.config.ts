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
import { SignupCampaigns } from './collections/SignupCampaigns'
import { Pages } from './collections/Pages'
import { Posts } from './collections/Posts'
import { Redirects } from './collections/Redirects'
import { Tags } from './collections/Tags'
import { OAuthClients } from './collections/OAuthClients'
import { OAuthGrants } from './collections/OAuthGrants'
import { Users } from './collections/Users'
import { Footer } from './globals/Footer'
import { Header } from './globals/Header'
import { SiteSettings } from './globals/SiteSettings'
import { resendAdapter } from './lib/email/resend'
import { mcp } from './lib/mcp/plugin'
import { trustedOrigins } from './lib/security/origins'
import { resolvePayloadSecret } from './lib/security/secret'
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
  // Which origins may spend a session cookie, and which `Host` header Payload
  // will believe when it builds a password-reset link. Empty — the default —
  // means the first check does not run and the second gives up; see
  // `lib/security/origins.ts` for what each of those costs.
  //
  // `cors` is deliberately left at its default. Nothing in the browser calls
  // this API cross-origin (the site renders through the Local API and the only
  // fetch it makes is same-origin, to /search/suggest), so there is no reason
  // to answer a cross-origin read with permission to read it.
  csrf: trustedOrigins(),
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
    SignupCampaigns,
    BillingEvents,
    // The OAuth layer's storage. Registered unconditionally, like the MCP
    // plugin's own key collection and for the same reason: the database schema
    // must not depend on whether an environment variable is set, or turning the
    // feature on becomes a migration rather than a restart.
    OAuthClients,
    OAuthGrants,
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
  // GraphQL is off because nothing asks for it, and an endpoint nothing asks
  // for is surface with no reader to justify it.
  //
  // Checked rather than assumed, because "the admin panel probably needs it" is
  // the reason it would otherwise stay: `@payloadcms/ui` contains no GraphQL
  // reference at all, Live Preview refreshes over postMessage
  // (`@payloadcms/live-preview-react`), and `plugin-mcp`, `richtext-lexical`,
  // `db-postgres` and `storage-s3` never call the route. Neither does anything
  // in this repository — the frontend renders through the Local API, and the
  // one fetch a browser makes is to `/search/suggest`.
  //
  // What it removes is not a hole but the cheapest amplifier on the API: the
  // `maxDepth` note below exists because `?depth=10` makes one request expensive,
  // and a nested GraphQL query is that idea with no ceiling on shape. It is
  // reachable on the CMS hostname by anything carrying an `Authorization` header
  // of any value — the Caddyfile's gate is a presence check, as its own comment
  // now says — so access control is the only thing behind it. That holds; the
  // work in front of it is what this declines to offer.
  //
  // `graphql` stays a dependency either way: `withPayload` externalises it at
  // build time to avoid a duplicate-instance error, so this changes what is
  // served, not what is installed. Payload's POST handler reads this flag and
  // answers 404.
  graphQL: { disable: true },
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
    // Always registered, for the same reason `mcp()` above is: a plugin that is
    // conditionally *added* makes the config a different shape in every
    // environment, and the admin import map is generated from that shape. A map
    // generated where S3 was unset was complete for that machine and missing
    // `S3ClientUploadHandler` on the server, which rendered the admin blank
    // from 22 Aug to 31 Aug. `enabled` decides the behaviour; the shape stays
    // constant. See docs/DEPLOYMENT_STATUS.md.
    //
    // `alwaysInsertFields` is deliberately left at its default: it would add
    // the plugin's prefix field to the media schema, which is a migration.
    s3Storage({
      enabled: useR2,
      bucket: process.env.S3_BUCKET ?? '',
      collections: { media: true },
      config: {
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
        },
        endpoint: process.env.S3_ENDPOINT,
        region: process.env.S3_REGION || 'auto',
      },
    }),
  ],
  // Throws rather than defaulting when this is missing or is one of the
  // placeholder values published in this repository — see lib/security/secret.ts
  // for why a quiet fallback here was a real incident, not a hypothetical one.
  secret: resolvePayloadSecret(),
  sharp,
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
})
