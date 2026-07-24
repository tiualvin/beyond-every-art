import config from '@payload-config'
import { getPayload, type Payload } from 'payload'

let cached: Promise<Payload> | null = null

/**
 * Returns a shared Payload Local API client, memoized across requests in the
 * same server instance so route handlers and the sitemap/feed builders reuse a
 * single connection pool instead of instantiating Payload per request.
 */
export function getPayloadClient(): Promise<Payload> {
  if (!cached) {
    cached = getPayload({ config })
  }
  return cached
}
