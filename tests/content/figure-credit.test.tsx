import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { FeaturedFigure } from '../../app/(frontend)/components/article'
import type { MediaImage } from '../../lib/content/media'

// Every feature image on this site is an Unsplash photograph and every credit
// names a photographer nobody could click through to, because the import kept
// the name and dropped the link. These hold the markup that gives it back.

const image = (overrides: Partial<MediaImage> = {}): MediaImage => ({
  url: '/api/media/file/ultramarine.jpg',
  alt: 'Ground ultramarine in a glass jar',
  width: 1600,
  height: 1067,
  caption: null,
  credit: 'Photo by Carolina / Unsplash',
  creditURL: null,
  cardUrl: null,
  ogUrl: null,
  ...overrides,
})

const render = (media: MediaImage) =>
  renderToStaticMarkup(<FeaturedFigure image={media} />)

describe('FeaturedFigure credits', () => {
  it('links the credit when the record says where to', () => {
    const html = render(image({ creditURL: 'https://unsplash.com/@shhiscat' }))
    expect(html).toContain('href="https://unsplash.com/@shhiscat?')
    expect(html).toContain('utm_source=beyond_every_art')
    expect(html).toContain('utm_medium=referral')
    expect(html).toContain('Photo by Carolina / Unsplash')
  })

  it('opens it away from the article, without handing over the opener', () => {
    const html = render(image({ creditURL: 'https://unsplash.com/@x' }))
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('still shows the credit when there is nowhere to point', () => {
    const html = render(image())
    expect(html).toContain('Photo by Carolina / Unsplash')
    expect(html).not.toContain('<a')
  })

  it('never renders a credit href the attribution gate refused', () => {
    // The field validates and the mapper vets, so reaching this needs a row
    // written around both. It is still the last thing between a stored string
    // and an href, and React will not stop it.
    const html = render(image({ creditURL: 'javascript:alert(1)' }))
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('<a')
    expect(html).toContain('Photo by Carolina / Unsplash')
  })

  it('renders no credit line at all when the record has no credit', () => {
    const html = render(image({ credit: null }))
    expect(html).not.toContain('article__figure-credit')
  })
})
