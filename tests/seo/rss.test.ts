import { describe, expect, it } from 'vitest'

import { renderRssFeed } from '../../lib/seo/rss'

describe('renderRssFeed', () => {
  const base = {
    title: 'Beyond Every Art',
    description: 'Art, color, and materials.',
    siteUrl: 'https://beyondeveryart.com',
    feedUrl: 'https://beyondeveryart.com/rss',
  }

  it('renders a valid RSS 2.0 shell with channel metadata', () => {
    const xml = renderRssFeed({ ...base, items: [] })
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(xml).toContain('<rss version="2.0"')
    expect(xml).toContain('<title>Beyond Every Art</title>')
    expect(xml).toContain(
      '<atom:link href="https://beyondeveryart.com/rss" rel="self" type="application/rss+xml"/>',
    )
  })

  it('renders one <item> per post with a permalink guid', () => {
    const xml = renderRssFeed({
      ...base,
      items: [
        {
          title: 'Titanium White',
          link: 'https://beyondeveryart.com/titanium-white/',
          description: 'Two whites.',
          pubDate: '2025-05-20T00:00:00.000Z',
          author: 'Livia M. Calderon',
        },
      ],
    })
    expect(xml.match(/<item>/g)).toHaveLength(1)
    expect(xml).toContain(
      '<guid isPermaLink="true">https://beyondeveryart.com/titanium-white/</guid>',
    )
    expect(xml).toContain('<dc:creator>Livia M. Calderon</dc:creator>')
    expect(xml).toContain('<pubDate>Tue, 20 May 2025 00:00:00 GMT</pubDate>')
  })

  it('escapes XML-significant characters in titles and descriptions', () => {
    const xml = renderRssFeed({
      ...base,
      items: [
        {
          title: 'Lead & Titanium <compared>',
          link: 'https://beyondeveryart.com/x/',
          description: 'A "quote" & an <angle>',
        },
      ],
    })
    expect(xml).toContain('Lead &amp; Titanium &lt;compared&gt;')
    expect(xml).toContain('A &quot;quote&quot; &amp; an &lt;angle&gt;')
    expect(xml).not.toContain('<compared>')
  })

  it('omits optional item fields when absent', () => {
    const xml = renderRssFeed({
      ...base,
      items: [{ title: 'No metadata', link: 'https://beyondeveryart.com/n/' }],
    })
    expect(xml).not.toContain('<pubDate>')
    expect(xml).not.toContain('<dc:creator>')
    // Only the channel-level <description> is present, none for the item.
    expect(xml.match(/<description>/g)).toHaveLength(1)
  })
})
