import { HTML_LIMITED_BOT_UA_RE } from 'next/dist/shared/lib/router/utils/is-bot'
import { describe, expect, it } from 'vitest'

import nextConfig from '../../next.config'
import {
  BLOCKING_METADATA_USER_AGENTS,
  getsMetadataInHead,
} from '../../lib/seo/metadata-bots'

// Who reads a page's title, canonical and hreflang from the HTML as it arrives,
// and so must be sent them in `<head>`. See lib/seo/metadata-bots.ts.

const CRAWLERS: Record<string, string> = {
  'Googlebot (smartphone)':
    'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.139 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'Googlebot (desktop)':
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'Googlebot-Image': 'Googlebot-Image/1.0',
  GoogleOther: 'GoogleOther',
  'Google-InspectionTool':
    'Mozilla/5.0 (compatible; Google-InspectionTool/1.0;)',
  Bingbot:
    'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  Applebot:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)',
  DuckDuckBot: 'DuckDuckBot/1.1; (+http://duckduckgo.com/duckduckbot.html)',
  GPTBot:
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.1; +https://openai.com/gptbot',
  'OAI-SearchBot':
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot',
  'ChatGPT-User':
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot',
  ClaudeBot:
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
  'Claude-User': 'Claude-User/1.0 (+https://support.anthropic.com/)',
  'anthropic-ai': 'anthropic-ai',
  PerplexityBot:
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
  'Perplexity-User':
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)',
  CCBot: 'CCBot/2.0 (https://commoncrawl.org/faq/)',
  Amazonbot:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 (Amazonbot/0.1; +https://developer.amazon.com/support/amazonbot)',
  Bytespider:
    'Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)',
  'meta-externalagent':
    'meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)',
  'cohere-ai': 'cohere-ai',
  'Screaming Frog': 'Screaming Frog SEO Spider/21.0',
  AhrefsBot:
    'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)',
  SemrushBot:
    'Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)',
  Sitebulb: 'Mozilla/5.0 (compatible; Sitebulb/8.0)',
  Slackbot: 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
  facebookexternalhit:
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  Twitterbot: 'Twitterbot/1.0',
  LinkedInBot:
    'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)',
  Discordbot:
    'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
  TelegramBot: 'TelegramBot (like TwitterBot)',
  Mastodon: 'http.rb/5.1.1 (Mastodon/4.2.0; +https://mastodon.social/)',
  Iframely: 'Iframely/1.3.1 (+https://iframely.com/docs/about)',
  Embedly: 'Mozilla/5.0 (compatible; Embedly/0.2; +http://support.embed.ly/)',
  'Snapchat preview':
    'Mozilla/5.0 (compatible; Snap URL Preview Service; snapchat_preview@snapchat.com)',
}

const BROWSERS: Record<string, string> = {
  'Chrome (Windows)':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Chrome (macOS)':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Chrome (Android)':
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  'Chrome (iOS)':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1',
  'Safari (macOS)':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  'Safari (iPhone)':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  'Firefox (Windows)':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Firefox (Android)':
    'Mozilla/5.0 (Android 14; Mobile; rv:133.0) Gecko/133.0 Firefox/133.0',
  Edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  Opera:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/115.0.0.0',
  'Samsung Internet':
    'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  'Facebook in-app':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/490.0.0.0;FBBV/650000000;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/18.1;FBSS/3;FBCR/;FBID/phone;FBLC/en_US;FBOP/5]',
  'Instagram in-app':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 357.0.0.0 (iPhone15,2; iOS 18_1; en_US; en; scale=3.00; 1179x2556; 650000000)',
}

describe('getsMetadataInHead', () => {
  it.each(Object.entries(CRAWLERS))(
    'sends %s the metadata in <head>',
    (_, ua) => {
      expect(getsMetadataInHead(ua)).toBe(true)
    },
  )

  it.each(Object.entries(BROWSERS))('lets %s keep streaming', (_, ua) => {
    expect(getsMetadataInHead(ua)).toBe(false)
  })

  it("keeps everything Next.js already sends blocking, so an upgrade's additions carry over", () => {
    for (const ua of Object.values({ ...CRAWLERS, ...BROWSERS })) {
      if (HTML_LIMITED_BOT_UA_RE.test(ua))
        expect(getsMetadataInHead(ua)).toBe(true)
    }
    expect(
      BLOCKING_METADATA_USER_AGENTS.startsWith(HTML_LIMITED_BOT_UA_RE.source),
    ).toBe(true)
  })

  it('is what next.config.ts hands to Next.js', () => {
    expect(nextConfig.htmlLimitedBots).toBeInstanceOf(RegExp)
    expect(nextConfig.htmlLimitedBots?.source).toBe(
      new RegExp(BLOCKING_METADATA_USER_AGENTS, 'i').source,
    )
  })
})
