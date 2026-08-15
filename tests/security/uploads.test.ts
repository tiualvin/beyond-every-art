import type { CollectionBeforeOperationHook } from 'payload'
import { describe, expect, it } from 'vitest'

import {
  MAX_AGENT_UPLOAD_BYTES,
  MAX_MEDIA_UPLOAD_BYTES,
  megabytes,
  refuseOversizedUpload,
} from '../../lib/security/uploads'
import { MAX_UPLOAD_BYTES } from '../../lib/mcp/upload'

type HookArgs = Parameters<CollectionBeforeOperationHook>[0]

/** Enough of the hook's argument to exercise it; the rest is never read. */
const call = (size?: number) =>
  refuseOversizedUpload({
    args: { marker: true },
    req: size === undefined ? {} : { file: { size } },
  } as unknown as HookArgs)

describe('refuseOversizedUpload', () => {
  it('lets an ordinary upload through untouched', () => {
    expect(call(2 * 1024 * 1024)).toEqual({ marker: true })
  })

  it('allows a file exactly on the ceiling', () => {
    expect(call(MAX_MEDIA_UPLOAD_BYTES)).toEqual({ marker: true })
  })

  it('refuses a file over the ceiling', () => {
    expect(() => call(MAX_MEDIA_UPLOAD_BYTES + 1)).toThrow(/limited to 25MB/)
  })

  // The message is what an editor sees in the admin panel, so it has to say
  // what was wrong and what to do, not just that something failed.
  it('says how large the file actually was', () => {
    expect(() => call(60 * 1024 * 1024)).toThrow(/60MB/)
  })

  // Every write to the collection runs this hook, not just uploads — a metadata
  // edit carries no file at all.
  it('ignores a write with no file', () => {
    expect(call()).toEqual({ marker: true })
  })
})

describe('upload ceilings', () => {
  // Two limits rather than one, for reasons recorded in lib/security/uploads.ts:
  // an agent's bytes travel as base64 through a model's context, an editor's do
  // not. The relationship is the part worth pinning — if the agent ceiling ever
  // exceeds the admin one, the smaller number has stopped meaning anything.
  it('keeps the agent ceiling at or below the admin one', () => {
    expect(MAX_AGENT_UPLOAD_BYTES).toBeLessThanOrEqual(MAX_MEDIA_UPLOAD_BYTES)
  })

  it('is the same number the MCP upload path enforces', () => {
    expect(MAX_UPLOAD_BYTES).toBe(MAX_AGENT_UPLOAD_BYTES)
  })

  it('renders a ceiling the way a message needs it', () => {
    expect(megabytes(8 * 1024 * 1024)).toBe('8MB')
  })
})
