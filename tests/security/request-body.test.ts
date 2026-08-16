import { describe, expect, it } from 'vitest'

import {
  readBoundedText,
  RequestBodyTooLarge,
} from '../../lib/security/request-body'

describe('readBoundedText', () => {
  it('returns a body at the byte limit', async () => {
    const request = new Request('https://example.com/ingest', {
      method: 'POST',
      body: '££',
    })

    await expect(readBoundedText(request, 4)).resolves.toBe('££')
  })

  it('rejects an oversized declared length before reading the stream', async () => {
    const request = new Request('https://example.com/ingest', {
      method: 'POST',
      headers: { 'content-length': '101' },
      body: 'small',
    })

    await expect(readBoundedText(request, 100)).rejects.toBeInstanceOf(
      RequestBodyTooLarge,
    )
  })

  it('counts streamed bytes when content-length is absent or false', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('123'))
        controller.enqueue(new TextEncoder().encode('456'))
        controller.close()
      },
    })
    const request = new Request('https://example.com/ingest', {
      method: 'POST',
      // Node requires this for a streaming request body.
      duplex: 'half',
      headers: { 'content-length': 'not-a-number' },
      body: stream,
    } as RequestInit & { duplex: 'half' })

    await expect(readBoundedText(request, 5)).rejects.toBeInstanceOf(
      RequestBodyTooLarge,
    )
  })

  it('rejects invalid limits', async () => {
    const request = new Request('https://example.com/ingest')
    await expect(readBoundedText(request, -1)).rejects.toBeInstanceOf(
      RangeError,
    )
  })
})
