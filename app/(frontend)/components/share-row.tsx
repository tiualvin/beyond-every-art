'use client'

import { useEffect, useState } from 'react'

/**
 * Copy link, email, and — where the browser has it — the native share sheet.
 *
 * The sheet is the whole social story: `navigator.share` hands off to whatever
 * the reader actually uses, so there is no list of networks to pick, maintain,
 * or load a third-party script for. It is absent on most desktop browsers, so
 * the button only appears once the client has confirmed support; rendering it
 * server-side would flash a control that then vanishes.
 */
export function ShareRow({ title }: { title: string }) {
  const [canShare, setCanShare] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  // Read after mount rather than during render: the server has no location,
  // and a URL baked at build time would be wrong for a dynamic route.
  const [url, setUrl] = useState('')

  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && 'share' in navigator)
    setUrl(window.location.href)
  }, [])

  useEffect(() => {
    if (!said) return
    const timer = setTimeout(() => setSaid(null), 1800)
    return () => clearTimeout(timer)
  }, [said])

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setSaid('Link copied')
    } catch {
      // Clipboard access is refused on insecure origins and by some settings.
      setSaid('Press ⌘C to copy')
    }
  }

  async function share() {
    try {
      await navigator.share({ title, url: window.location.href })
    } catch {
      // Dismissing the sheet rejects; that is not a failure worth reporting.
    }
  }

  const mailto = `mailto:?subject=${encodeURIComponent(
    title,
  )}&body=${encodeURIComponent(`${title}\n\n${url}`)}`

  return (
    <div className="share">
      <button type="button" onClick={copy}>
        Copy link
      </button>
      <a className="share__link" href={mailto}>
        Email
      </a>
      {canShare && (
        <button type="button" onClick={share}>
          Share
        </button>
      )}
      {/* Announced rather than only shown: the confirmation is the entire
          feedback for an action with no visible result. */}
      <p className="share__said" role="status" aria-live="polite">
        {said}
      </p>
    </div>
  )
}
