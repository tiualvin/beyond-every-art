import { describe, expect, it } from 'vitest'

import { displayHost, resolveEmbed, safeHref } from '../../lib/content/embed'

describe('resolveEmbed', () => {
  it('accepts the YouTube URL shapes an editor actually pastes', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    ]) {
      expect(resolveEmbed(url), url).toMatchObject({
        provider: 'youtube',
        src: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
      })
    }
  })

  it('keeps extra query parameters out of the frame src', () => {
    // A pasted URL carries playlist, timestamp and tracking parameters. Only
    // the ID is used, so none of them reach the provider.
    const resolved = resolveEmbed(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123&t=42s&si=track',
    )

    expect(resolved?.src).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    )
  })

  it('accepts Vimeo watch and player URLs', () => {
    expect(resolveEmbed('https://vimeo.com/123456789')).toMatchObject({
      provider: 'vimeo',
      src: 'https://player.vimeo.com/video/123456789',
    })
    expect(
      resolveEmbed('https://player.vimeo.com/video/123456789'),
    ).toMatchObject({ provider: 'vimeo' })
  })

  it('refuses a provider that is not on the allowlist', () => {
    // The designed outcome, not a failure: the caller renders a link, and this
    // site never frames an origin nobody reviewed.
    expect(resolveEmbed('https://example.com/video/1')).toBeNull()
    expect(resolveEmbed('https://dailymotion.com/video/x1')).toBeNull()
  })

  it('is not fooled by a hostname that merely contains a provider name', () => {
    expect(
      resolveEmbed('https://youtube.com.evil.test/watch?v=abc123'),
    ).toBeNull()
    expect(resolveEmbed('https://notyoutube.com/watch?v=abc123')).toBeNull()
    expect(
      resolveEmbed('https://evil.test/?x=youtube.com/watch?v=abc'),
    ).toBeNull()
  })

  it('refuses anything that is not https', () => {
    expect(
      resolveEmbed('http://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    ).toBeNull()
    expect(resolveEmbed('javascript:alert(1)')).toBeNull()
    expect(resolveEmbed('data:text/html,<script>alert(1)</script>')).toBeNull()
  })

  it('refuses an id that is not shaped like one', () => {
    // The id is interpolated into the frame src, so anything that could carry
    // path or query syntax has to be rejected before it gets there.
    expect(
      resolveEmbed('https://www.youtube.com/watch?v=../../evil'),
    ).toBeNull()
    expect(resolveEmbed('https://www.youtube.com/watch?v=')).toBeNull()
    expect(resolveEmbed('https://vimeo.com/not-a-number')).toBeNull()
  })

  it('treats a missing or empty URL as nothing to frame', () => {
    expect(resolveEmbed(null)).toBeNull()
    expect(resolveEmbed(undefined)).toBeNull()
    expect(resolveEmbed('   ')).toBeNull()
    expect(resolveEmbed('not a url')).toBeNull()
  })
})

describe('safeHref', () => {
  it('passes relative paths and https URLs', () => {
    expect(safeHref('/journal')).toBe('/journal')
    expect(safeHref('https://example.com/a')).toBe('https://example.com/a')
    expect(safeHref('  /journal  ')).toBe('/journal')
  })

  it('refuses script and other executable schemes', () => {
    // The value's destination is an anchor href, where javascript: is script
    // running as whoever could write the document.
    expect(safeHref('javascript:alert(1)')).toBeNull()
    expect(safeHref('JavaScript:alert(1)')).toBeNull()
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(safeHref('vbscript:msgbox(1)')).toBeNull()
  })

  it('refuses protocol-relative URLs', () => {
    // `//evil.test` is not a path on this site, it is another origin wearing
    // the shape of one.
    expect(safeHref('//evil.test/x')).toBeNull()
  })

  it('refuses plain http', () => {
    expect(safeHref('http://example.com')).toBeNull()
  })

  it('treats empty as no link', () => {
    expect(safeHref(null)).toBeNull()
    expect(safeHref('')).toBeNull()
    expect(safeHref('   ')).toBeNull()
  })
})

describe('displayHost', () => {
  it('names the site a link goes to, without the www', () => {
    expect(displayHost('https://www.burlington.org.uk/a')).toBe(
      'burlington.org.uk',
    )
  })

  it('has nothing to show for an internal path or an unsafe link', () => {
    expect(displayHost('/journal')).toBeNull()
    expect(displayHost('javascript:alert(1)')).toBeNull()
  })
})
