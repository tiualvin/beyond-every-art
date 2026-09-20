'use client'

import Link from 'next/link'

import { NEWSLETTER_PATH } from '@/lib/seo/site'

import { openSubscribeModal } from './subscribe-signal'

/**
 * A call to action that opens the masthead's subscribe modal.
 *
 * A link to `/newsletter/` that intercepts its own click, rather than a
 * `<button>`. The modal is React state inside `SiteChrome`, so a button does
 * nothing at all before hydration and nothing ever with scripting off — and
 * this is a crawlable, middle-clickable link to a real page that happens to
 * open the modal instead when it can. The fallback is the behaviour this
 * control had before the modal was wired to it, which is the right thing to
 * fall back to.
 *
 * `MembershipGate` uses a plain button for the same modal, correctly: it is
 * already a client component, and a gate that offered a link to somewhere else
 * at the moment it is asking for a subscription would be sending the reader
 * away from the piece they were reading.
 */
export function SubscribeLink({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={NEWSLETTER_PATH}
      className={className}
      onClick={(event) => {
        // Let a modified click do what the reader asked: open the newsletter
        // page in a new tab or window rather than a modal in this one.
        if (
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          event.button !== 0
        ) {
          return
        }
        event.preventDefault()
        openSubscribeModal()
      }}
    >
      {children}
    </Link>
  )
}
