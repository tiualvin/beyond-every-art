'use client'

import { RefreshRouteOnSave } from '@payloadcms/live-preview-react'
import { useRouter } from 'next/navigation'

/**
 * Re-renders the page when the admin saves the document being previewed.
 *
 * Payload posts a message from the edit view to this iframe on every save;
 * `router.refresh()` re-runs the server components, so the preview reflects the
 * same data the published page would render — relationships resolved, images
 * sized — rather than a second client-side approximation of it.
 *
 * `serverURL` is the origin the message must come from, so a page embedded by
 * anyone else is ignored.
 */
export function LivePreviewListener({ serverURL }: { serverURL: string }) {
  const router = useRouter()
  return (
    <RefreshRouteOnSave
      refresh={() => router.refresh()}
      serverURL={serverURL}
    />
  )
}
