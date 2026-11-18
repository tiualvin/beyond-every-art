// Keeping stored media URLs in the shape the file route actually serves.
//
// Payload serves an upload at `/api/media/file/<name>` and redirects the
// slashed form to it. A browser follows that redirect, so a stored
// `/api/media/file/<name>/` looks harmless until something fetches it without
// following redirects — which is exactly what `next/image` does. The optimiser
// dispatches a local `url` through the app's own request handler, reads the 308
// as the resource, fails to sniff an image, and answers `400 The requested
// resource isn't a valid image.` Every feature image and card thumbnail on the
// site then fails to render.
//
// The read path already normalises (`normalizeMediaUrl` in
// `lib/content/media.ts`), so existing rows render correctly. This is the write
// half: it stops a trailing slash being stored again, so the database heals as
// documents are next saved rather than carrying a defect that needs a one-off
// repair.
//
// Where the slash comes from, and why the first version of this did nothing.
// Payload's upload field regenerates `url` (and each size's) in its own
// `beforeChange` field hook, through `formatAdminURL`, which appends a slash
// whenever `NEXT_TRAILING_SLASH` is `true` — and Next sets that inside the
// server because `next.config.ts` has `trailingSlash: true`. Payload runs a
// collection's `beforeChange` hooks *before* its fields' (3.90.2,
// `collections/operations/utilities/update.js`), so a collection hook that
// stripped the slash ran first and the field hook put it back: every media
// save through the server stored the slashed form. The strip now runs as a
// field hook on those same fields. Payload merges a collection's declaration of
// an upload field with its own and concatenates their hooks, its own first, so
// this one runs last. `tests/media/urls.test.ts` runs the merged hooks the way
// Payload does and fails if that order is ever lost.

import type { Field, FieldHook, ImageSize } from 'payload'

/** A trailing slash is never part of the address Payload answers without a redirect. */
export function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '')
}

/** The `beforeChange` hook that runs after Payload has generated a URL. */
export const deslashStoredUrl: FieldHook = ({ value }) =>
  typeof value === 'string' ? stripTrailingSlashes(value) : value

const urlField = (): Field => ({
  name: 'url',
  type: 'text',
  // Payload's own label, restated because the label rule reads this
  // declaration (tests/collections/field-labels.test.ts).
  label: 'URL',
  hooks: { beforeChange: [deslashStoredUrl] },
})

/**
 * Declarations of the upload's own `url` fields — the original's and each
 * size's — that add `deslashStoredUrl` after Payload's hook. Nothing else is
 * declared, so everything else about those fields stays Payload's, and the
 * database schema is unchanged.
 */
export function deslashedUrlFields(imageSizes: ImageSize[]): Field[] {
  return [
    urlField(),
    {
      name: 'sizes',
      type: 'group',
      fields: imageSizes.map((size): Field => ({
        name: size.name,
        type: 'group',
        fields: [urlField()],
      })),
    },
  ]
}
