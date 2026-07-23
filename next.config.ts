import { withPayload } from '@payloadcms/next/withPayload'

import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: process.env.S3_PUBLIC_URL
      ? [
          {
            hostname: new URL(process.env.S3_PUBLIC_URL).hostname,
            protocol: 'https',
          },
        ]
      : [],
  },
  reactStrictMode: true,
}

export default withPayload(nextConfig)
