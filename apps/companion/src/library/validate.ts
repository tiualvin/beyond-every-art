// What may be stored, and what a stored row must still look like when read.
//
// A saved article is read back through the same contract as one fresh from the
// network. A copy written by an older version of the app, or damaged on disk,
// is dropped rather than rendered half-understood — the reader can save it
// again, which is better than an article missing paragraphs nobody noticed.

import { z } from 'zod/v4'

import {
  PostDetailSchema,
  PostSummarySchema,
  markUnsupported,
  type PostDetail,
  type PostSummary,
} from '../api/contract'
import type { PaletteInput } from './types'

export const MAX_PALETTE_COLOURS = 8
export const MAX_PALETTE_NAME = 60

const HexColour = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .transform((value) => value.toLowerCase())

export const PaletteInputSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(MAX_PALETTE_NAME),
  colours: z.array(HexColour).min(1).max(MAX_PALETTE_COLOURS),
})

export function validPaletteInput(input: PaletteInput): PaletteInput {
  return PaletteInputSchema.parse(input)
}

export function readStoredPost(json: string): PostDetail | null {
  try {
    const raw = JSON.parse(json) as { body?: unknown }
    const parsed = PostDetailSchema.safeParse({
      ...raw,
      body: markUnsupported(raw.body),
    })
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function readStoredSummary(json: string): PostSummary | null {
  try {
    const parsed = PostSummarySchema.safeParse(JSON.parse(json))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** A listing's fields, from a full article. */
export function summaryOf(post: PostDetail | PostSummary): PostSummary {
  return PostSummarySchema.parse({
    ...post,
    authors: post.authors.map(({ name, slug }) => ({ name, slug })),
  })
}

/** Unique enough for one device's palettes, with no native module to ask. */
export function newId(now: number = Date.now()): string {
  return `${now.toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
