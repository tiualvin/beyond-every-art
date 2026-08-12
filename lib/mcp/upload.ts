// Turning a base64 image from an MCP client into something safe to store.
//
// The bytes arrive from whatever agent holds a key, so nothing the caller says
// about them is trusted: the format is read from the file's own magic bytes
// rather than from a claimed MIME type or a filename extension, and the size is
// checked before the string is ever decoded into memory.

/** Decoded ceiling. Comfortably above a generated illustration, well below
 *  anything that would be a memory problem to hold while Payload resizes it. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024

/**
 * Formats accepted over MCP, identified by their leading bytes.
 *
 * SVG is deliberately absent. The collection's own `image/*` rule allows it,
 * and an SVG is a document that can carry script — served from the media host
 * it would be a stored cross-site scripting vector, which is not a risk worth
 * taking for a format no image generator emits anyway. Uploading one through
 * the admin panel, where a person chose the file, is unchanged.
 */
const SIGNATURES: Array<{
  extension: string
  matches: (bytes: Uint8Array) => boolean
  mimetype: string
}> = [
  {
    extension: 'png',
    matches: (b) =>
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
    mimetype: 'image/png',
  },
  {
    extension: 'jpg',
    matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
    mimetype: 'image/jpeg',
  },
  {
    extension: 'webp',
    // "RIFF" .... "WEBP"
    matches: (b) =>
      b[0] === 0x52 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x46 &&
      b[8] === 0x57 &&
      b[9] === 0x45 &&
      b[10] === 0x42 &&
      b[11] === 0x50,
    mimetype: 'image/webp',
  },
]

export type DecodedUpload = {
  data: Buffer
  mimetype: string
  name: string
  size: number
}

/** Strips a `data:` URL wrapper and any whitespace a client wrapped lines at. */
function unwrapBase64(value: string): string {
  const withoutPrefix = value.replace(/^data:[^;,]*;base64,/i, '')
  return withoutPrefix.replace(/\s+/g, '')
}

/**
 * A filename that is safe to put on disk and in a URL.
 *
 * Payload writes uploads under the media directory using this name, so it must
 * not be able to climb out of it or collide with shell or URL syntax. The
 * extension comes from the sniffed format, never from what the caller sent.
 */
export function safeUploadName(
  requested: string | undefined,
  extension: string,
): string {
  const base = (requested ?? '')
    .replace(/^.*[\\/]/, '')
    .replace(/\.[^.]*$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)

  return `${base || 'image'}.${extension}`
}

/**
 * Decodes and vets a base64 image, or throws with a message an agent can act
 * on. Every rejection says what was wrong rather than failing generically,
 * because the caller is a model that will otherwise retry the same way.
 */
export function decodeImageUpload(input: {
  base64: string
  filename?: string
}): DecodedUpload {
  const encoded = unwrapBase64(input.base64)

  if (!encoded) throw new Error('No image data was supplied.')
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
    throw new Error(
      'The image data is not valid base64. Send the raw base64 of the file, ' +
        'optionally as a data: URL.',
    )
  }

  // Checked before decoding: a caller should not be able to make the server
  // allocate an arbitrary buffer just by sending a longer string.
  const approximateBytes = (encoded.length * 3) / 4
  if (approximateBytes > MAX_UPLOAD_BYTES) {
    throw new Error(
      `The image is larger than the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB limit for MCP uploads.`,
    )
  }

  const data = Buffer.from(encoded, 'base64')
  if (data.length > MAX_UPLOAD_BYTES) {
    throw new Error(
      `The image is larger than the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB limit for MCP uploads.`,
    )
  }

  const signature = SIGNATURES.find((candidate) => candidate.matches(data))
  if (!signature) {
    throw new Error(
      'Unrecognised image format. PNG, JPEG and WebP are accepted over MCP; ' +
        'SVG is not, because it can carry script.',
    )
  }

  return {
    data,
    mimetype: signature.mimetype,
    name: safeUploadName(input.filename, signature.extension),
    size: data.length,
  }
}
