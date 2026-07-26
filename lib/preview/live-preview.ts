import { getSiteUrl, pagePath, postPath } from '../seo/site'

/** Collections an editor can preview on the public site. */
export const PREVIEW_COLLECTIONS = ['posts', 'pages'] as const

export type PreviewCollection = (typeof PREVIEW_COLLECTIONS)[number]

/**
 * Marks a preview session as running inside the admin's Live Preview iframe.
 *
 * Draft mode alone cannot carry this: Next.js exposes it as a bare on/off
 * switch with no payload. The frontend needs the distinction to mount the
 * live-preview listener and to drop the draft banner, which is chrome an editor
 * already surrounded by the admin UI has no use for.
 */
export const LIVE_PREVIEW_COOKIE = 'bea-live-preview'

/** Path of the route that opens a preview session. */
export const PREVIEW_PATH = '/api/preview'

export function isPreviewCollection(
  value: unknown,
): value is PreviewCollection {
  return PREVIEW_COLLECTIONS.includes(value as PreviewCollection)
}

/** Roles allowed to see unpublished content on the public site. */
const PREVIEW_ROLES = new Set(['admin', 'author', 'editor'])

/**
 * Whether an authenticated user may preview drafts.
 *
 * Members are deliberately excluded. They authenticate against a different
 * collection and have no editorial standing, so a member session must never
 * open unpublished work.
 */
export function isPreviewRole(user: unknown): boolean {
  const role = (user as { role?: unknown } | null | undefined)?.role
  return typeof role === 'string' && PREVIEW_ROLES.has(role)
}

/** Where a previewable document lives on the public site. */
export function previewTargetPath(
  collection: PreviewCollection,
  slug: string,
): string {
  return collection === 'pages' ? pagePath(slug) : postPath(slug)
}

type PreviewUrlArgs = {
  collection: unknown
  slug: unknown
  /** Build the URL for the admin's Live Preview iframe rather than a new tab. */
  live?: boolean
  siteUrl?: string
}

/**
 * The `/api/preview` URL for a document, or `null` when there is nothing to
 * preview yet.
 *
 * Returning `null` is load-bearing. A document being created has no slug, and
 * Payload reads a `null` here as "no preview available", hiding the button and
 * the Live Preview tab instead of pointing an iframe at `/undefined/`.
 *
 * No secret is included. The admin and the site are one Next.js application on
 * one origin, so the browser sends the Payload session cookie with the iframe
 * and new-tab requests alike, and `/api/preview` authorizes against that. A
 * secret in this URL would buy nothing and would leak into browser history,
 * referrers, and any screenshot of the edit view.
 */
export function buildPreviewUrl({
  collection,
  slug,
  live = false,
  siteUrl = getSiteUrl(),
}: PreviewUrlArgs): string | null {
  if (!isPreviewCollection(collection)) return null
  if (typeof slug !== 'string' || !slug.trim()) return null

  const params = new URLSearchParams({ collection, slug })
  if (live) params.set('live', '1')

  return `${siteUrl}${PREVIEW_PATH}?${params.toString()}`
}
