import { appPath, pagePath, postPath } from '../seo/site'

/** Collections an editor can preview on the public site. */
export const PREVIEW_COLLECTIONS = ['posts', 'pages', 'apps'] as const

/**
 * Globals an editor can preview, and the page each is previewed against.
 *
 * All three appear on every page, so the homepage is the honest choice: it is
 * the one URL that carries the masthead, the footer and the newsletter card at
 * once, which is what these globals actually control.
 *
 * Narrower than a collection preview, and worth being exact about. Globals have
 * no drafts and no autosave, so the iframe shows the *saved* global and
 * refreshes when one is saved — it does not follow keystrokes the way a post
 * does. Closing that gap needs the client-side `useLivePreview` hook and the
 * isomorphic mapper that `docs/LIVE_PREVIEW.md` lists as not built. Seeing the
 * nav you just saved, in place, without leaving the panel, is the part that was
 * missing and the part this gives.
 */
export const PREVIEW_GLOBALS = ['header', 'footer', 'site-settings'] as const

export type PreviewGlobal = (typeof PREVIEW_GLOBALS)[number]

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
  if (collection === 'pages') return pagePath(slug)
  if (collection === 'apps') return appPath(slug)
  return postPath(slug)
}

type PreviewUrlArgs = {
  collection: unknown
  slug: unknown
  /** Build the URL for the admin's Live Preview iframe rather than a new tab. */
  live?: boolean
}

/**
 * The `/api/preview` URL for a document, or `null` when there is nothing to
 * preview yet.
 *
 * Returning `null` is load-bearing. A document being created has no slug, and
 * Payload reads a `null` here as "no preview available", hiding the button and
 * the Live Preview tab instead of pointing an iframe at `/undefined/`.
 *
 * No secret is included. `/api/preview` authorizes against the Payload session
 * cookie the browser already holds, and a secret here would buy nothing while
 * leaking into browser history, referrers, and any screenshot of the edit view.
 *
 * **Relative, deliberately, and this used to be absolute.** It was built from
 * `NEXT_PUBLIC_SITE_URL` while the admin and the public site were one
 * application on one origin, which they no longer are: the admin is served
 * only on `CMS_ADDRESS` and the public site only on the site address. An
 * absolute URL therefore sent an editor from the host holding their session to
 * one that had never seen it, and Payload's session cookie does not travel
 * between hostnames — so the Preview button and the Live Preview iframe both
 * arrived at `/api/preview` anonymous and were refused, correctly, with
 * `Not authorized to preview`.
 *
 * A relative URL resolves against whichever host the admin is being served
 * from, so the cookie is always present and the arrangement of hostnames stops
 * mattering. `/api/preview` then redirects to a path rather than a URL, which
 * keeps the whole flow on that host.
 *
 * The alternative — repointing `NEXT_PUBLIC_SITE_URL` at `CMS_ADDRESS` — is
 * not available and should not be reached for: the same value builds canonical
 * tags, the sitemap and the feed, and aiming those at the staff hostname would
 * trade a broken button for a genuine SEO fault.
 */
export function buildPreviewUrl({
  collection,
  slug,
  live = false,
}: PreviewUrlArgs): string | null {
  if (!isPreviewCollection(collection)) return null
  if (typeof slug !== 'string' || !slug.trim()) return null

  const params = new URLSearchParams({ collection, slug })
  if (live) params.set('live', '1')

  return `${PREVIEW_PATH}?${params.toString()}`
}
