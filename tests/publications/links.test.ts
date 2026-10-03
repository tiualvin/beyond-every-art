import { describe, expect, it } from 'vitest'

import { classifyPublicationLink } from '../../lib/publications/links'

const SITE = 'https://www.beyondeveryart.com'

const classify = (value: unknown) => classifyPublicationLink(value, SITE)

describe('classifyPublicationLink: other sites', () => {
  it('keeps an https address', () => {
    expect(classify('https://www.tate.org.uk/art/artworks/turner')).toEqual({
      kind: 'external',
      href: 'https://www.tate.org.uk/art/artworks/turner',
    })
  })

  it('refuses plaintext http rather than upgrading it', () => {
    // An upgraded link to a host with no certificate is a broken link that
    // looks deliberate. The editor reviewing extracted links sees the refusal.
    expect(classify('http://example.com/catalogue')).toEqual({
      kind: 'refused',
      reason: 'insecure',
    })
  })

  it('refuses a username in the address', () => {
    // Goes to evil.example, while reading as this site.
    expect(classify('https://beyondeveryart.com@evil.example/')).toEqual({
      kind: 'refused',
      reason: 'credentials',
    })
    expect(classify('https://user:pass@example.com/')).toEqual({
      kind: 'refused',
      reason: 'credentials',
    })
  })
})

describe('classifyPublicationLink: dangerous schemes', () => {
  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'java\tscript:alert(1)',
    ' javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///Users/designer/Desktop/issue.indd',
    'ftp://example.com/file.pdf',
  ])('refuses %j', (value) => {
    expect(classify(value).kind).toBe('refused')
  })

  it('refuses addresses that leave the site from a path', () => {
    // A browser reads both as another host.
    expect(classify('//evil.example/x').kind).toBe('refused')
    expect(classify('/\\evil.example/x').kind).toBe('refused')
  })

  it('never turns a link on this site into one that leaves it', () => {
    // Each of these is on this site as written, so the origin check passes.
    // Made relative naively, each became `//evil.example`, which a browser
    // follows to another host.
    for (const value of [
      'https://www.beyondeveryart.com//evil.example',
      'https://www.beyondeveryart.com///evil.example/x',
      '/.//evil.example',
      '/..//evil.example',
    ]) {
      const link = classify(value)
      expect(link.kind).toBe('internal')
      if (link.kind === 'internal') expect(link.href).not.toMatch(/^\/\//)
    }
    expect(classify('/.//evil.example')).toEqual({
      kind: 'internal',
      href: '/evil.example',
    })
  })

  it('refuses relative paths with no meaning outside the PDF', () => {
    expect(classify('page-18.html')).toEqual({
      kind: 'refused',
      reason: 'unparseable',
    })
  })

  it('refuses anything that is not a non-empty string', () => {
    for (const value of [undefined, null, '', '   ', 42, {}]) {
      expect(classify(value)).toEqual({ kind: 'refused', reason: 'empty' })
    }
  })
})

describe('classifyPublicationLink: this site', () => {
  it('turns an absolute link to this site into a path', () => {
    expect(classify('https://www.beyondeveryart.com/journal/')).toEqual({
      kind: 'internal',
      href: '/journal/',
    })
  })

  it('recognises the bare host and plaintext, both of which redirect here', () => {
    expect(classify('http://beyondeveryart.com/tag/pigments/')).toEqual({
      kind: 'internal',
      href: '/tag/pigments/',
    })
    expect(classify('HTTPS://BEYONDEVERYART.COM/about/')).toEqual({
      kind: 'internal',
      href: '/about/',
    })
  })

  it('keeps a root-relative path', () => {
    expect(classify('/the-chemistry-of-ultramarine/')).toEqual({
      kind: 'internal',
      href: '/the-chemistry-of-ultramarine/',
    })
  })

  it('adds the trailing slash the site serves, and keeps the query and hash', () => {
    expect(classify('/journal')).toEqual({
      kind: 'internal',
      href: '/journal/',
    })
    expect(
      classify(
        'https://www.beyondeveryart.com/publication/spring-2025/read?page=18',
      ),
    ).toEqual({
      kind: 'internal',
      href: '/publication/spring-2025/read/?page=18',
    })
    expect(classify('/about#contact')).toEqual({
      kind: 'internal',
      href: '/about/#contact',
    })
  })

  it('leaves a file path alone', () => {
    expect(classify('/api/media/file/plate.webp')).toEqual({
      kind: 'internal',
      href: '/api/media/file/plate.webp',
    })
  })

  it('follows the configured site, whichever host it names', () => {
    expect(
      classifyPublicationLink(
        'https://www.example.org/journal/',
        'https://example.org',
      ),
    ).toEqual({ kind: 'internal', href: '/journal/' })
  })
})

describe('classifyPublicationLink: email', () => {
  it('keeps one address and drops the rest', () => {
    expect(classify('mailto:editor@beyondeveryart.com')).toEqual({
      kind: 'email',
      href: 'mailto:editor@beyondeveryart.com',
    })
    expect(
      classify('mailto:editor@beyondeveryart.com?subject=Hi&cc=x@example.com'),
    ).toEqual({ kind: 'email', href: 'mailto:editor@beyondeveryart.com' })
  })

  it('refuses a list, an empty address or junk', () => {
    expect(classify('mailto:a@example.com,b@example.com').kind).toBe('refused')
    expect(classify('mailto:').kind).toBe('refused')
    expect(classify('mailto:not-an-address').kind).toBe('refused')
    expect(classify('mailto:%E0%A4%A').kind).toBe('refused')
  })
})
