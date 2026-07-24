// Database write path for member migration.
//
// Mirrors lib/migration/import.ts: consumes a pure MemberPlan[] and upserts
// through Payload's Local API, keyed on `ghostID` so reruns update existing
// records instead of creating duplicates.

import type { Payload } from 'payload'

import type { MemberPlan } from './members'

export interface MemberImportResult {
  created: number
  updated: number
  errors: string[]
}

export async function importMembers(
  payload: Payload,
  plan: MemberPlan[],
): Promise<MemberImportResult> {
  const result: MemberImportResult = { created: 0, updated: 0, errors: [] }

  for (const member of plan) {
    try {
      const existing = await payload.find({
        collection: 'members',
        where: { ghostID: { equals: member.ghostID } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      const current = existing.docs[0] as { id: string | number } | undefined

      if (current) {
        await payload.update({
          collection: 'members',
          id: current.id,
          data: member.data,
          overrideAccess: true,
        })
        result.updated++
      } else {
        await payload.create({
          collection: 'members',
          data: member.data,
          overrideAccess: true,
        })
        result.created++
      }
    } catch (error) {
      result.errors.push(
        `member ${member.data.email}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  return result
}
