import type { Access, Where } from 'payload'

import { notScheduled, publishedStatus } from '../lib/content/schedule'
import { PUBLICATIONS_LAUNCHED } from '../lib/publications/launch'

import { isEditor } from './roles'

/**
 * Publications a request may read through the API.
 *
 * The site's routes are not the only door. On the CMS hostname the Caddyfile
 * forwards any `/api` request that carries an `Authorization` header, of any
 * value, so `publishedOrEditors` alone would hand a published issue to an
 * anonymous client while every page about it still answered 404 — and it
 * checks only `_status`, so a future-dated issue and a trashed one (trash sets
 * `deletedAt` and leaves `_status` alone) would come back too.
 *
 * So the API answers the way the site does. Before launch, nobody but editors
 * reads an issue. After it, a reader gets what the routes would show: published,
 * dated today or earlier, and not in the trash. Editors read everything, which
 * is what the admin and an editor's preview need.
 *
 * The site itself does not depend on this — its reads run with
 * `overrideAccess` and apply `live()` themselves — so this changes what the API
 * gives away, not what the pages render.
 */
export function publicationsReadFor(launched: boolean): Access {
  return ({ req }) => {
    if (isEditor(req.user)) return true
    if (!launched) return false

    const live: Where = {
      and: [publishedStatus, notScheduled(), { deletedAt: { exists: false } }],
    }
    return live
  }
}

export const publicationsRead: Access = publicationsReadFor(
  PUBLICATIONS_LAUNCHED,
)

/**
 * Page images a request may read.
 *
 * Before launch, editors only — the files and the listing alike. After it, a
 * file is served to anyone holding its URL, and the listing stays with
 * editors. Gating each file on its issue being live would cost a Postgres
 * query on every image request Cloudflare does not answer, and buy little:
 * the names are 128-bit hashes nothing links to until the reader does, and an
 * edge cache serves whatever it holds to anyone with the URL regardless
 * (`docs/PUBLICATION_SYSTEM.md`, open decision 3, accepts this). The listing is
 * different — it would hand out every name at once, drafts' included — so
 * `isReadingStaticFile` is what separates the two.
 */
export function publicationPageImagesReadFor(launched: boolean): Access {
  return ({ req, isReadingStaticFile }) => {
    if (isEditor(req.user)) return true
    if (!launched || !isReadingStaticFile) return false
    // A condition every image meets, rather than `true`, and it is the
    // difference between serving the file and a 500. Given `true`, Payload's
    // file route loads no document and hands the R2 handler nothing, so the
    // handler looks the file up itself — through this same rule, without
    // `isReadingStaticFile`, which refuses an anonymous reader, and the
    // refusal comes back as a server error for every page of every issue.
    // Given a condition, the route loads the document and passes it on. Local
    // storage never makes that second lookup, so CI could not see this; it
    // was found by driving the route against a stand-in for R2.
    const served: Where = { publication: { exists: true } }
    return served
  }
}

export const publicationPageImagesRead: Access = publicationPageImagesReadFor(
  PUBLICATIONS_LAUNCHED,
)
