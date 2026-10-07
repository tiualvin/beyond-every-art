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
