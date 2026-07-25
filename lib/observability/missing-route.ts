// Server-side glue for 404 logging: reads the request headers and emits the
// structured line built in ./not-found.
//
// This lives next to, rather than inside, the pure helper so the filtering
// logic stays unit-testable without pulling `next/headers` into the test run.
//
// It is called from the routes that resolve content by slug, immediately before
// `notFound()`. Logging from `app/(frontend)/not-found.tsx` looks tempting but
// is wrong: the App Router renders the not-found boundary as part of every
// response, so that component runs on successful requests too and would report
// a 404 for every page view.

import { headers } from 'next/headers'

import { logNotFound } from './not-found'

/** Record a request for a slug that no longer resolves to content. */
export async function logMissingRoute(path: string): Promise<void> {
  let referrer: string | null = null
  try {
    referrer = (await headers()).get('referer')
  } catch {
    // No request scope (or headers unavailable): still worth logging the path.
  }
  logNotFound({ path, referrer })
}
