export type RssItem = {
  title: string
  link: string
  guid?: string
  description?: string
  pubDate?: Date | string | number | null
  author?: string
}

export type RssChannel = {
  title: string
  description: string
  siteUrl: string
  feedUrl: string
  items: readonly RssItem[]
  language?: string
  lastBuildDate?: Date | string | number | null
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function toRfc822(value: Date | string | number | null | undefined): string {
  const date = value ? new Date(value) : new Date()
  const resolved = Number.isNaN(date.getTime()) ? new Date() : date
  return resolved.toUTCString()
}

function renderItem(item: RssItem): string {
  const parts = [
    `<title>${escapeXml(item.title)}</title>`,
    `<link>${escapeXml(item.link)}</link>`,
    `<guid isPermaLink="true">${escapeXml(item.guid ?? item.link)}</guid>`,
    item.pubDate ? `<pubDate>${toRfc822(item.pubDate)}</pubDate>` : '',
    item.author ? `<dc:creator>${escapeXml(item.author)}</dc:creator>` : '',
    item.description
      ? `<description>${escapeXml(item.description)}</description>`
      : '',
  ]
  return `<item>${parts.filter(Boolean).join('')}</item>`
}

/**
 * Renders a valid RSS 2.0 feed document. Pure and framework-free so it can be
 * unit tested; the route handler supplies the channel metadata and items.
 */
export function renderRssFeed(channel: RssChannel): string {
  const header = [
    `<title>${escapeXml(channel.title)}</title>`,
    `<link>${escapeXml(channel.siteUrl)}</link>`,
    `<description>${escapeXml(channel.description)}</description>`,
    channel.language
      ? `<language>${escapeXml(channel.language)}</language>`
      : '',
    `<lastBuildDate>${toRfc822(channel.lastBuildDate)}</lastBuildDate>`,
    `<atom:link href="${escapeXml(channel.feedUrl)}" rel="self" type="application/rss+xml"/>`,
  ]

  const items = channel.items.map(renderItem).join('')

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom">' +
    '<channel>' +
    header.filter(Boolean).join('') +
    items +
    '</channel>' +
    '</rss>'
  )
}
