import type { EmbedData } from '@/blocks/schema'
import { displayHost, resolveEmbed, safeHref } from '@/lib/content/embed'

/**
 * A provider video, framed by this application rather than by pasted markup.
 *
 * A URL from a provider that is not on the allowlist in `lib/content/embed.ts`
 * renders as a link. That is the designed outcome, not a degradation: it means
 * an editor can paste anything without this site ever framing an origin nobody
 * reviewed, and the reader still gets to the video.
 *
 * The iframe is sandboxed to the capabilities a player actually needs. Notably
 * absent is `allow-top-navigation`, so a frame cannot navigate the article out
 * from under the reader. `allow-same-origin` is present because both providers
 * need it to play at all — it grants the frame its *own* origin, not this one.
 */
export function Embed({ data }: { data: EmbedData }) {
  const title = data.title?.trim()
  const resolved = resolveEmbed(data.url)

  if (!resolved) {
    const href = safeHref(data.url)
    if (!href || !title) return null
    const host = displayHost(href)

    return (
      <p className="module module--embed-link">
        <a href={href} rel="noopener noreferrer" target="_blank">
          {title}
        </a>
        {host && <span className="embed__host"> — {host}</span>}
      </p>
    )
  }

  if (!title) return null

  return (
    <figure
      className={`module module--embed embed embed--${resolved.provider}`}
    >
      <div
        className="embed__frame"
        style={{ aspectRatio: resolved.aspectRatio }}
      >
        <iframe
          src={resolved.src}
          title={title}
          loading="lazy"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
        />
      </div>
    </figure>
  )
}
