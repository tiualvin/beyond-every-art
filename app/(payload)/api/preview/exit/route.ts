import { draftMode } from 'next/headers'
import { redirect } from 'next/navigation'

/** Turns off Next.js draft mode and returns to the homepage. */
export async function GET() {
  const draft = await draftMode()
  draft.disable()
  redirect('/')
}
