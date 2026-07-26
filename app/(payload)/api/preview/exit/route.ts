import { cookies, draftMode } from 'next/headers'
import { redirect } from 'next/navigation'

import { LIVE_PREVIEW_COOKIE } from '@/lib/preview/live-preview'

/** Turns off Next.js draft mode and returns to the homepage. */
export async function GET() {
  const draft = await draftMode()
  draft.disable()

  const jar = await cookies()
  jar.delete(LIVE_PREVIEW_COOKIE)

  redirect('/')
}
