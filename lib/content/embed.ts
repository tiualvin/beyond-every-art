// Which providers may be framed, and what frame to build for them.
//
// The embed block stores a watch URL, not provider markup. This module is the
// only thing that turns one into an iframe, so the set of origins this site can
// be made to frame is the list below and nothing else. An editor pasting a URL
// from anywhere else gets a link, not a silent failure and not an arbitrary
// third-party frame.
//
// Origins here must also be in `CSP_FRAME_SRC` for the browser to load them —
// see `lib/security/csp.ts`. Two lists rather than one is deliberate: this one
// decides what the application will build, the header decides what the browser
// will fetch, and an embed added here without the header is blocked rather
// than quietly trusted.

export type EmbedProvider = 'youtube' | 'vimeo'

export type ResolvedEmbed = {
  provider: EmbedProvider
  /** The `src` for the iframe. */
  src: string
  /** Intrinsic ratio, so the frame reserves its space before it loads. */
  aspectRatio: string
}

/** Video IDs are opaque; accept only what the providers actually issue. */
const YOUTUBE_ID = /^[\w-]{6,20}$/
const VIMEO_ID = /^\d{6,12}$/

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'www.youtu.be',
])

const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'])

function youtubeId(url: URL): string | null {
  // youtu.be/<id>
  if (url.hostname.endsWith('youtu.be')) {
    return url.pathname.split('/').filter(Boolean)[0] ?? null
  }
  // youtube.com/watch?v=<id>
  const query = url.searchParams.get('v')
  if (query) return query
  // youtube.com/embed/<id> and /shorts/<id>
  const segments = url.pathname.split('/').filter(Boolean)
  if (segments[0] === 'embed' || segments[0] === 'shorts') {
    return segments[1] ?? null
  }
  return null
}

function vimeoId(url: URL): string | null {
  const segments = url.pathname.split('/').filter(Boolean)
  // vimeo.com/<id> and player.vimeo.com/video/<id>
  const candidate = segments[0] === 'video' ? segments[1] : segments[0]
  return candidate ?? null
}

/**
 * The frame to build for a URL, or `null` when nothing here is willing to
 * frame it.
 *
 * `null` is a normal outcome, not an error: the caller renders a link. That is
 * also what an unparseable or non-https URL gets, so a malformed value can
 * never reach an iframe `src`.
 */
export function resolveEmbed(
  rawUrl: string | null | undefined,
): ResolvedEmbed | null {
  const raw = (rawUrl ?? '').trim()
  if (!raw) return null

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null

  const host = url.hostname.toLowerCase()

  if (YOUTUBE_HOSTS.has(host)) {
    const id = youtubeId(url)
    if (!id || !YOUTUBE_ID.test(id)) return null
    return {
      provider: 'youtube',
      // The no-cookie host is the one `.env.example` already names for
      // CSP_FRAME_SRC, and it is the variant that does not set advertising
      // cookies before a reader has pressed play.
      src: `https://www.youtube-nocookie.com/embed/${id}`,
      aspectRatio: '16 / 9',
    }
  }

  if (VIMEO_HOSTS.has(host)) {
    const id = vimeoId(url)
    if (!id || !VIMEO_ID.test(id)) return null
    return {
      provider: 'vimeo',
      src: `https://player.vimeo.com/video/${id}`,
      aspectRatio: '16 / 9',
    }
  }

  return null
}

/**
 * A link an editor typed, reduced to something safe to put in an `href`.
 *
 * Relative paths and `https:` pass through; everything else — `javascript:`
 * above all — becomes `null` and the caller renders text instead of a link.
 * The field validators already refuse these on write; this is the render-time
 * half, because a document can also arrive from a restore or an import that
 * never ran them.
 */
export function safeHref(value: string | null | undefined): string | null {
  const raw = (value ?? '').trim()
  if (!raw) return null
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw
  try {
    return new URL(raw).protocol === 'https:' ? raw : null
  } catch {
    return null
  }
}

/** The host of a URL, for showing a reader where a link goes. */
export function displayHost(value: string | null | undefined): string | null {
  const href = safeHref(value)
  if (!href || href.startsWith('/')) return null
  try {
    return new URL(href).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}
