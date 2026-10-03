// Size ceilings for uploaded files.
//
// Payload v3's `UploadConfig` has no option for a maximum size — `filesize`
// belongs to a stored file's metadata, not to the collection's rules — so
// `collections/Media.ts` could restrict the format and nothing else. An upload
// through the admin panel was bounded only by free disk, on a VPS where the
// database, the media directory, and the container images share one volume.
//
// The proper defence is a request body limit in front of the application, which
// rejects the bytes before they are ever buffered. That is recorded in
// `docs/EDGE_PROTECTION.md` and sequenced behind the Cloudflare work, because
// where it goes depends on what ends up in front of the origin. This is the
// half that does not have to wait: it runs in `beforeOperation`, which Payload
// calls before `generateFileData` reads `req.file`, so an oversized upload is
// refused before anything is written to disk or handed to sharp.
//
// It is a ceiling, not a body limit. The bytes have still reached the process
// by the time this runs, so it bounds what gets *stored*, not what a stranger
// can make the server receive. Only the edge can do the second one.
//
// **For uploads through the admin panel or the REST API, this is not the limit
// that bites.** Payload parses every multipart body before any hook runs, with
// the root `upload` options from `payload.config.ts` — which sets none — so the
// installed version's defaults apply: 20 MB per file and 50 MB per request,
// refused with a 413 and Payload's own message. A 22 MB photograph never
// reaches the check below. What this ceiling still governs is everything that
// skips the multipart parser — the Local API, which the import and restore
// scripts write through — and the admin path too if `MEDIA_MAX_UPLOAD_MB` is
// set below 20, or if the root setting is ever raised above it. Raising that
// root setting raises it for every upload collection at once, and multipart
// bodies are buffered in the app container's memory, so it is not the way to
// admit a large file to one collection; `docs/PUBLICATION_SYSTEM.md` has the
// alternatives.

import { APIError, type CollectionBeforeOperationHook } from 'payload'

import { configuredLimit } from './rate-limit'

const MEGABYTE = 1024 * 1024

/**
 * What a person may upload to `media`, wherever this check is reached first.
 *
 * Through the admin panel Payload's 20 MB multipart default is reached first;
 * see the header. The 25 MB default here was set before that existed, and is
 * left as it is rather than lowered to match, so the multipart limit stays the
 * one an editor meets and this stays the backstop for the Local API.
 *
 * Generous on purpose. This publication writes about specific works, and an
 * editor uploading a high-resolution photograph of one is doing the job rather
 * than abusing the endpoint — a ceiling that rejects real editorial material
 * would be worked around by resizing images down until they fit, which is worse
 * than the disk it saves. It exists to stop the pathological case, not to
 * enforce a house style.
 */
export const MAX_MEDIA_UPLOAD_BYTES =
  configuredLimit('MEDIA_MAX_UPLOAD_MB', 25) * MEGABYTE

/**
 * What an agent may upload over MCP.
 *
 * Lower than the admin ceiling, and deliberately so: these bytes arrive as
 * base64 inside a tool call, so they pass through a model's context on the way
 * here. The limit that matters on that path is reached long before disk is a
 * concern. `lib/mcp/upload.ts` checks it against the encoded length before
 * decoding, so a long string cannot make the server allocate against it.
 */
export const MAX_AGENT_UPLOAD_BYTES = 8 * MEGABYTE

/** Human-readable ceiling, for a message a person or an agent has to act on. */
export function megabytes(bytes: number): string {
  return `${Math.round(bytes / MEGABYTE)}MB`
}

/**
 * Refuses an upload larger than the ceiling, before Payload stores it.
 *
 * `413` rather than a validation error: the admin panel surfaces the message,
 * and any other client gets the status that actually describes what happened.
 */
export const refuseOversizedUpload: CollectionBeforeOperationHook = ({
  args,
  req,
}) => {
  const size = req.file?.size
  if (typeof size === 'number' && size > MAX_MEDIA_UPLOAD_BYTES) {
    throw new APIError(
      `That file is ${megabytes(size)}. Uploads are limited to ` +
        `${megabytes(MAX_MEDIA_UPLOAD_BYTES)}; resize it and try again.`,
      413,
    )
  }

  return args
}
