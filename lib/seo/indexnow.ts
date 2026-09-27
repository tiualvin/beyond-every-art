// IndexNow: telling Bing, and the engines that share its submissions, that a
// URL changed, at the moment it changes.
//
// The sitemap already tells them, eventually — Bing reads it on its own
// schedule, and for a publication that schedule is the gap between an article
// going up and an article being findable. Bing's index is what Copilot and
// DuckDuckGo answer from and one of the sources ChatGPT search draws on, so
// closing that gap is the point. Google does not take part in IndexNow and is
// unaffected either way.
//
// Three rules shape it, each for something that would otherwise go wrong:
//
// - **Only a publish is news.** Autosave writes a draft version per typing
//   pause, and a scheduled post is published with a future date and stays off
//   the site until then (`lib/content/schedule.ts`). Neither is a public
//   change, and announcing one invites a crawl that finds nothing new, or a
//   404. An unpublish is not announced either: in `afterChange` it looks the
//   same as an autosave of a published post, and the sitemap drops the URL.
//   A delete is announced, from `afterDelete`, where it is unambiguous.
// - **Batched and throttled.** Submissions wait a few seconds and go as one
//   request, so a bulk publish from the admin list is one call rather than
//   dozens; and a URL sent in the last ten minutes is not sent again, because
//   an editor saving a correction twice is not two changes a crawler needs to
//   hear about. The IndexNow documentation asks for exactly this restraint.
// - **Never in the way.** Nothing awaits the request and nothing it does can
//   throw into a save. A failure is a JSON log line, next to the others.
//
// Off unless `INDEXNOW_KEY` is set, off on a noindexed deployment, and off
// wherever the site's own URL is not public https. The `migrate` service has
// the key blanked in `docker-compose.yml`, so a Ghost re-import or a tag
// clean-up never announces a hundred URLs at once.

import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
} from 'payload'

// Relative imports, like everything a collection config pulls in: the
// Payload CLI loads these too, outside Next's resolver.
import { isScheduled } from '../content/schedule'
import { isNoindex } from './indexing'
import { absoluteUrl, getSiteUrl } from './site'

type Env = Record<string, string | undefined>

/** Where the key file is served. Fixed, and named to IndexNow as `keyLocation`. */
export const INDEXNOW_KEY_PATH = '/indexnow.txt'

/** The shared endpoint; a submission here reaches every participating engine. */
export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow'

/** Seconds' grace before a batch goes, so a burst of saves is one request. */
const FLUSH_AFTER_MS = 5_000

/** How long a submitted URL is left alone. */
const REPEAT_AFTER_MS = 10 * 60_000

/** The protocol's ceiling for one request. */
const MAX_URLS_PER_REQUEST = 10_000

/** 8–128 letters, digits and dashes, which is the protocol's whole rule. */
export function isValidKey(key: string): boolean {
  return /^[A-Za-z0-9-]{8,128}$/.test(key)
}

/**
 * The key, when the key file should be served: set, well formed, and not on a
 * noindexed deployment. Unlike `indexNowConfig` this does not care what the
 * site's URL is — the file itself is harmless anywhere, and serving it on the
 * loopback address is how the end-to-end suite proves the route answers.
 */
export function indexNowKey(env: Env = process.env): string | null {
  const key = env.INDEXNOW_KEY?.trim() ?? ''
  if (!key || !isValidKey(key) || isNoindex(env)) return null
  return key
}

export type IndexNowConfig = {
  key: string
  /** The site's host, which every submitted URL must be on. */
  host: string
  keyLocation: string
}

/**
 * Everything a submission needs, or null when this deployment should not make
 * one. Null is the common answer: in development, in the test suite, on
 * staging, and in production until the owner sets a key.
 */
export function indexNowConfig(
  env: Env = process.env,
  siteUrl: string = getSiteUrl(),
): IndexNowConfig | null {
  const key = indexNowKey(env)
  if (!key) return null

  let url: URL
  try {
    url = new URL(siteUrl)
  } catch {
    return null
  }
  // Only a public https origin. A submission for localhost or a bare IP is
  // refused by the endpoint anyway, and making it would mean a development
  // machine with a copied `.env` announcing URLs nobody can fetch.
  if (url.protocol !== 'https:') return null
  if (url.hostname === 'localhost' || !url.hostname.includes('.')) return null
  if (/^[\d.]+$/.test(url.hostname) || url.hostname.includes(':')) return null

  return {
    key,
    host: url.host,
    keyLocation: absoluteUrl(INDEXNOW_KEY_PATH, siteUrl),
  }
}

/** The fields of a post or page these rules read. */
export type Publishable = {
  slug?: string | null
  _status?: string | null
  publishedAt?: string | null
}

/** Published and due: on the site right now. */
function isLive(doc: Publishable | null | undefined, now: Date): boolean {
  if (!doc?.slug || doc._status !== 'published') return false
  return !isScheduled(doc._status, doc.publishedAt, now)
}

/**
 * What a save changed that a crawler should hear about: the document's URL if
 * it is live, and its old URL too if a live document moved.
 */
export function urlsOnChange(input: {
  doc: Publishable
  previousDoc?: Publishable | null
  pathFor: (slug: string) => string
  siteUrl: string
  now?: Date
}): string[] {
  const now = input.now ?? new Date()
  if (!isLive(input.doc, now)) return []

  const urls = [absoluteUrl(input.pathFor(input.doc.slug!), input.siteUrl)]
  const previous = input.previousDoc
  if (
    previous?.slug &&
    previous.slug !== input.doc.slug &&
    isLive(previous, now)
  ) {
    urls.push(absoluteUrl(input.pathFor(previous.slug), input.siteUrl))
  }
  return urls
}

/** A deleted document's URL, if it was on the site when it went. */
export function urlsOnDelete(input: {
  doc: Publishable
  pathFor: (slug: string) => string
  siteUrl: string
  now?: Date
}): string[] {
  if (!isLive(input.doc, input.now ?? new Date())) return []
  return [absoluteUrl(input.pathFor(input.doc.slug!), input.siteUrl)]
}

/** The request body the protocol defines. */
export function buildSubmission(
  config: IndexNowConfig,
  urls: readonly string[],
): { host: string; key: string; keyLocation: string; urlList: string[] } {
  return {
    host: config.host,
    key: config.key,
    keyLocation: config.keyLocation,
    urlList: [...urls],
  }
}

type Send = (
  body: ReturnType<typeof buildSubmission>,
) => Promise<{ status: number }>

/** One JSON line, like the other observability events. Never throws. */
function log(
  level: 'info' | 'warn',
  event: 'indexnow_submitted' | 'indexnow_failed',
  detail: Record<string, unknown>,
): void {
  try {
    const line = JSON.stringify({
      level,
      event,
      time: new Date().toISOString(),
      ...detail,
    })
    if (level === 'warn') console.warn(line)
    else console.info(line)
  } catch {
    // Observability is best effort.
  }
}

/**
 * Collects URLs for a few seconds, drops any sent recently, and submits the
 * rest as one request. Clock, timer and transport are injectable so the rules
 * are testable without waiting or dialling out.
 */
export class IndexNowQueue {
  private pending = new Set<string>()
  private sentAt = new Map<string, number>()
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly config: IndexNowConfig,
    private readonly send: Send = postSubmission,
    private readonly now: () => number = Date.now,
    private readonly flushAfterMs: number = FLUSH_AFTER_MS,
    private readonly repeatAfterMs: number = REPEAT_AFTER_MS,
  ) {}

  enqueue(urls: readonly string[]): void {
    for (const url of urls) this.pending.add(url)
    if (this.pending.size === 0 || this.timer) return
    this.timer = setTimeout(() => void this.flush(), this.flushAfterMs)
    // Never the reason a process stays alive.
    this.timer.unref?.()
  }

  /** Submit what is pending now. Resolves when the request has settled. */
  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null

    const now = this.now()
    for (const [url, at] of this.sentAt) {
      if (now - at >= this.repeatAfterMs) this.sentAt.delete(url)
    }
    const urls = [...this.pending].filter((url) => !this.sentAt.has(url))
    this.pending.clear()
    if (urls.length === 0) return

    for (let start = 0; start < urls.length; start += MAX_URLS_PER_REQUEST) {
      const batch = urls.slice(start, start + MAX_URLS_PER_REQUEST)
      for (const url of batch) this.sentAt.set(url, now)
      try {
        const { status } = await this.send(buildSubmission(this.config, batch))
        // 200 is accepted; 202 is accepted with the key still being checked,
        // which is what the first submission after setting a key returns.
        if (status === 200 || status === 202) {
          log('info', 'indexnow_submitted', { status, urls: batch.length })
        } else {
          log('warn', 'indexnow_failed', { status, urls: batch.length })
        }
      } catch (error) {
        log('warn', 'indexnow_failed', {
          reason: error instanceof Error ? error.message : String(error),
          urls: batch.length,
        })
      }
    }
  }
}

async function postSubmission(
  body: ReturnType<typeof buildSubmission>,
): Promise<{ status: number }> {
  const response = await fetch(INDEXNOW_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  })
  return { status: response.status }
}

let queue: IndexNowQueue | null = null

function queueFor(config: IndexNowConfig): IndexNowQueue {
  queue ??= new IndexNowQueue(config)
  return queue
}

/** `afterChange` for a collection whose documents are served at `pathFor`. */
export function indexNowOnChange(
  pathFor: (slug: string) => string,
): CollectionAfterChangeHook {
  return ({ doc, previousDoc }) => {
    try {
      const config = indexNowConfig()
      if (!config) return doc
      const urls = urlsOnChange({
        doc: doc as Publishable,
        previousDoc: previousDoc as Publishable | null,
        pathFor,
        siteUrl: getSiteUrl(),
      })
      if (urls.length > 0) queueFor(config).enqueue(urls)
    } catch {
      // A submission is a courtesy to a crawler; it never fails a save.
    }
    return doc
  }
}

/** `afterDelete` for the same. */
export function indexNowOnDelete(
  pathFor: (slug: string) => string,
): CollectionAfterDeleteHook {
  return ({ doc }) => {
    try {
      const config = indexNowConfig()
      if (!config) return doc
      const urls = urlsOnDelete({
        doc: doc as Publishable,
        pathFor,
        siteUrl: getSiteUrl(),
      })
      if (urls.length > 0) queueFor(config).enqueue(urls)
    } catch {
      // As above.
    }
    return doc
  }
}
