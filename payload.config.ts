import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import path from 'node:path'
import { buildConfig } from 'payload'
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'

import { Authors } from './collections/Authors'
import { Media } from './collections/Media'
import { Pages } from './collections/Pages'
import { Posts } from './collections/Posts'
import { Redirects } from './collections/Redirects'
import { Tags } from './collections/Tags'
import { Users } from './collections/Users'
import { Footer } from './globals/Footer'
import { Header } from './globals/Header'
import { SiteSettings } from './globals/SiteSettings'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)
const useR2 = Boolean(process.env.S3_BUCKET && process.env.S3_ENDPOINT)

export default buildConfig({
  admin: { user: Users.slug, importMap: { baseDir: path.resolve(dirname) } },
  collections: [Users, Authors, Tags, Media, Posts, Pages, Redirects],
  db: postgresAdapter({ pool: { connectionString: process.env.DATABASE_URI } }),
  editor: lexicalEditor(),
  globals: [SiteSettings, Header, Footer],
  plugins: useR2
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
    : [],
  secret: process.env.PAYLOAD_SECRET || '',
  sharp,
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
})
