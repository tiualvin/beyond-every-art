/** Raised before an unauthenticated request body can consume unbounded memory. */
export class RequestBodyTooLarge extends Error {
  constructor(readonly maxBytes: number) {
    super(`Request body exceeds the ${maxBytes}-byte limit`)
    this.name = 'RequestBodyTooLarge'
  }
}

/**
 * Read a request body while enforcing a limit on bytes actually received.
 *
 * `Content-Length` is checked as a cheap early refusal, but is only a claim:
 * chunked requests can omit it and callers can lie. Reading the stream a chunk
 * at a time prevents `request.text()` from allocating an attacker-controlled
 * string before the application gets a chance to inspect its size.
 */
export async function readBoundedText(
  request: Request,
  maxBytes: number,
): Promise<string> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError('maxBytes must be a non-negative safe integer')
  }

  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new RequestBodyTooLarge(maxBytes)
  }

  if (!request.body) return ''

  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let received = 0
  let text = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      received += value.byteLength
      if (received > maxBytes) {
        await reader.cancel()
        throw new RequestBodyTooLarge(maxBytes)
      }
      text += decoder.decode(value, { stream: true })
    }
    return text + decoder.decode()
  } finally {
    reader.releaseLock()
  }
}
