// Database write path for redirect migration.
//
// Mirrors lib/migration/import.ts: consumes a pure RedirectPlan and upserts
// through Payload's Local API, keyed on the unique `source` field so reruns
// update existing rules instead of creating duplicates.

import type { Payload } from 'payload'

import type { RedirectPlan } from './redirects'

export interface RedirectImportResult {
  created: number
  updated: number
  errors: string[]
}

export async function importRedirects(
  payload: Payload,
  plan: RedirectPlan[],
): Promise<RedirectImportResult> {
  const result: RedirectImportResult = { created: 0, updated: 0, errors: [] }

  for (const rule of plan) {
    try {
      const existing = await payload.find({
        collection: 'redirects',
        where: { source: { equals: rule.source } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      const current = existing.docs[0] as { id: string | number } | undefined
      const data = {
        source: rule.source,
        destination: rule.destination,
        statusCode: rule.statusCode,
      }

      if (current) {
        await payload.update({
          collection: 'redirects',
          id: current.id,
          data,
          overrideAccess: true,
        })
        result.updated++
      } else {
        await payload.create({
          collection: 'redirects',
          data,
          overrideAccess: true,
        })
        result.created++
      }
    } catch (error) {
      result.errors.push(
        `redirect ${rule.source}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  return result
}
