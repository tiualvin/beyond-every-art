// The Unsplash API, and the only file in this repository that talks to it.
//
// This replaces the picker Ghost's editor had, which is where every feature
// image on this site came from. Two MCP tools sit on top of it —
// `findStockPhoto` and `importStockPhoto` in `lib/mcp/tools.ts` — and nothing
// else imports the vendor, so a different library later is a different module
// rather than a change to the tools. See docs/STOCK_IMAGERY.md.
//
// Four rules shape it, and each is a way an agent could otherwise end up
// deciding something the server should:
//
//   1. **The access key goes to one origin.** Every API address is built here
//      from a constant and a validated id. The one address Unsplash hands back
//      that we must call — `links.download_location` — is called only when its
//      origin is exactly `https://api.unsplash.com`. An agent never supplies an
//      address this module sends the key to.
//   2. **The import trusts Unsplash's record, not the agent's.** Attribution,
//      provenance and the image address are all derived from `GET /photos/:id`,
//      so nothing a model copied, paraphrased or was talked into can land in a
//      credit line.
//   3. **Unsplash+ is refused.** Those photographs are licensed separately,
//      not under the Unsplash License, and have been reported to appear in API
//      results. The host they are served from is the check relied on, because
//      the flags that mark them are not in the official documentation.
//   4. **Errors are written for a model to act on**, and never contain the key.

import { attributionHref, toCreditURL } from '../content/attribution'

const API_ORIGIN = 'https://api.unsplash.com'

/** Where Unsplash-License photographs are served from; Unsplash+ is elsewhere. */
const IMAGE_HOST = 'images.unsplash.com'

/** Abandoned after this, so a slow API cannot hold a tool call open. */
const TIMEOUT_MS = 10_000

/**
 * Candidates per search. The API allows thirty; six is what a person can
 * compare at a glance, and what keeps a tool result small.
 */
export const MAX_CANDIDATES = 6

/** Pages a search may ask for. Past five, the query wants rewording. */
export const MAX_PAGE = 5

/**
 * The width stored. The post template draws a feature image at most 44rem
 * wide — 1408px on a 2x screen — and the `og` derivative wants 1200x630, so
 * this leaves room for a redesign without storing a multi-megabyte original.
 */
const STORED_WIDTH = 2400

/** Unsplash ids are short and URL-safe; anything else is not put in a path. */
const PHOTO_ID = /^[A-Za-z0-9_-]{1,32}$/

export const ORIENTATIONS = ['landscape', 'portrait', 'squarish'] as const
export type Orientation = (typeof ORIENTATIONS)[number]

/** A refusal or failure a model can act on. Never carries the access key. */
export class StockPhotoError extends Error {}

/** The fields of an Unsplash photo this module uses, narrowed and checked. */
export type UnsplashPhoto = {
  altDescription: string | null
  description: string | null
  downloadLocation: string
  height: number | null
  id: string
  /** Whether Unsplash flagged it as Unsplash+ — advisory; see `isFreeLicence`. */
  plusFlag: boolean
  photographer: { name: string; profile: string }
  urls: { raw: string; small: string }
  width: number | null
}

/** One search result, shaped for a person choosing between them. */
export type StockCandidate = {
  description: string | null
  height: number | null
  id: string
  photoPage: string | null
  photographer: string
  photographerProfile: string | null
  preview: string
  width: number | null
}

/** What a stored photograph's Media document says about where it came from. */
export type StockAttribution = {
  credit: string
  creditURL: string | null
  sourceURL: string
}

export type UnsplashClient = {
  photo(id: string): Promise<UnsplashPhoto>
  search(input: {
    orientation?: Orientation
    page?: number
    query: string
  }): Promise<{
    candidates: StockCandidate[]
    omitted: number
    quotaRemaining: number | null
    total: number
  }>
  trackDownload(photo: UnsplashPhoto): Promise<boolean>
}

type Env = Record<string, string | undefined>

/** The access key, or null when stock search is not configured. */
export function unsplashAccessKey(env: Env = process.env): string | null {
  const key = env.UNSPLASH_ACCESS_KEY?.trim()
  return key ? key : null
}

export const NOT_CONFIGURED =
  'Stock photo search is not configured on this deployment. An administrator ' +
  'has to set UNSPLASH_ACCESS_KEY on the server; until then, find an image ' +
  'another way and use `uploadMediaFromUrl`.'

/** The photograph's own page, built from its id rather than taken from a link. */
export function photoPageURL(id: string): string {
  return `https://unsplash.com/photos/${encodeURIComponent(id)}`
}

function string(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function hostOf(address: string): string | null {
  try {
    const url = new URL(address)
    return url.protocol === 'https:' ? url.hostname.toLowerCase() : null
  } catch {
    return null
  }
}

/**
 * Narrows an API photo to what this module uses, or null if it lacks any of
 * it. A record missing its photographer or its download location cannot be
 * attributed or reported, so it is not offered.
 */
export function toPhoto(value: unknown): UnsplashPhoto | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const urls = (record.urls ?? {}) as Record<string, unknown>
  const links = (record.links ?? {}) as Record<string, unknown>
  const user = (record.user ?? {}) as Record<string, unknown>
  const userLinks = (user.links ?? {}) as Record<string, unknown>

  const id = string(record.id)
  const raw = string(urls.raw)
  const small = string(urls.small)
  const downloadLocation = string(links.download_location)
  const name = string(user.name)
  const profile = string(userLinks.html)

  if (!id || !PHOTO_ID.test(id)) return null
  if (!raw || !small || !downloadLocation || !name || !profile) return null

  return {
    altDescription: string(record.alt_description),
    description: string(record.description),
    downloadLocation,
    height: number(record.height),
    id,
    plusFlag: record.plus === true || record.premium === true,
    photographer: { name, profile },
    urls: { raw, small },
    width: number(record.width),
  }
}

/**
 * Whether a photograph is under the Unsplash License.
 *
 * The host is what decides. Unsplash+ photographs are served from
 * `plus.unsplash.com`, and the `plus` and `premium` booleans that mark them
 * appear in responses but not in the documentation — so they are honoured
 * when present and never relied on when absent.
 */
export function isFreeLicence(photo: UnsplashPhoto): boolean {
  if (photo.plusFlag) return false
  return (
    hostOf(photo.urls.raw) === IMAGE_HOST &&
    hostOf(photo.urls.small) === IMAGE_HOST
  )
}

/** The address the stored file is fetched from, sized for this site. */
export function imageAddress(photo: UnsplashPhoto): string {
  if (!isFreeLicence(photo)) {
    throw new StockPhotoError(
      `Photo ${photo.id} is not under the Unsplash License (it looks like ` +
        'Unsplash+), so it cannot be used here. Choose another.',
    )
  }

  // Parsed already by `isFreeLicence`, so this cannot throw. The parameters it
  // carries — `ixid` among them — are kept; ours are added alongside.
  const url = new URL(photo.urls.raw)
  url.searchParams.set('w', String(STORED_WIDTH))
  // Never enlarges: a small original is stored at its own size.
  url.searchParams.set('fit', 'max')
  url.searchParams.set('fm', 'jpg')
  url.searchParams.set('q', '85')
  return url.toString()
}

/** Collapses whitespace and caps length, since this lands in a credit line. */
function plainName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, 120)
}

/**
 * The credit, link and provenance a stored photograph carries.
 *
 * `Photo by <name> / Unsplash` is the form every one of the 110 migrated
 * credits takes, so a new one reads like the old ones. The profile link is
 * stored bare — `attributionHref` adds the referral parameters Unsplash asks
 * for when the credit renders, as it does for every existing credit.
 */
export function attributionFor(photo: UnsplashPhoto): StockAttribution {
  return {
    credit: `Photo by ${plainName(photo.photographer.name)} / Unsplash`,
    creditURL: toCreditURL(photo.photographer.profile),
    sourceURL: photoPageURL(photo.id),
  }
}

function toCandidate(photo: UnsplashPhoto): StockCandidate {
  return {
    // Unsplash's `alt_description` is machine-written. It is offered as a
    // starting point for the alt text the import requires, not as the answer.
    description: photo.altDescription ?? photo.description,
    height: photo.height,
    id: photo.id,
    photoPage: attributionHref(photoPageURL(photo.id)),
    photographer: plainName(photo.photographer.name),
    photographerProfile: attributionHref(photo.photographer.profile),
    preview: photo.urls.small,
    width: photo.width,
  }
}

function remainingQuota(response: Response): number | null {
  const value = Number(response.headers.get('x-ratelimit-remaining'))
  return response.headers.has('x-ratelimit-remaining') && Number.isFinite(value)
    ? value
    : null
}

/**
 * Turns a refusal into something an agent can act on.
 *
 * Unsplash answers an exhausted hourly quota with a 403 rather than a 429,
 * so the remaining-quota header is read as well as the status.
 */
async function refusal(response: Response, id?: string): Promise<never> {
  if (response.status === 401) {
    throw new StockPhotoError(
      'Unsplash rejected this deployment’s access key. An administrator needs ' +
        'to check UNSPLASH_ACCESS_KEY; retrying will not help.',
    )
  }

  if (response.status === 403 || response.status === 429) {
    const body = await response.text().catch(() => '')
    if (remainingQuota(response) === 0 || /rate limit/i.test(body)) {
      throw new StockPhotoError(
        'This deployment’s Unsplash quota for the hour is spent. Try again ' +
          'later, or find an image another way and use `uploadMediaFromUrl`.',
      )
    }
  }

  if (response.status === 404 && id) {
    throw new StockPhotoError(`There is no Unsplash photo with id \`${id}\`.`)
  }

  throw new StockPhotoError(`Unsplash answered ${response.status}.`)
}

/**
 * A client for the three calls the tools need, or null when no key is set.
 *
 * `fetchImpl` exists for tests; everything else uses the global `fetch`.
 */
export function unsplashClient(
  env: Env = process.env,
  fetchImpl: typeof fetch = fetch,
): UnsplashClient | null {
  const key = unsplashAccessKey(env)
  if (!key) return null

  /**
   * One authorised request. The address is checked here, not by the caller:
   * whatever path led to this line, the key is only ever sent to the API.
   */
  const request = async (address: URL): Promise<Response> => {
    if (address.origin !== API_ORIGIN) {
      throw new StockPhotoError('Refusing to send the access key off Unsplash.')
    }

    try {
      return await fetchImpl(address, {
        headers: {
          Accept: 'application/json',
          'Accept-Version': 'v1',
          // A header, never the `client_id` query parameter, which would put
          // the key into every address anything logs.
          Authorization: `Client-ID ${key}`,
        },
        method: 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch {
      // Deliberately not the underlying message: it can describe this
      // server's network to the caller, and says nothing they can act on.
      throw new StockPhotoError('Unsplash could not be reached. Try again.')
    }
  }

  return {
    async photo(id) {
      if (!PHOTO_ID.test(id)) {
        throw new StockPhotoError(
          `\`${id.slice(0, 40)}\` is not an Unsplash photo id. Use an \`id\` ` +
            'returned by `findStockPhoto`.',
        )
      }

      const response = await request(
        new URL(`/photos/${encodeURIComponent(id)}`, API_ORIGIN),
      )
      if (!response.ok) return refusal(response, id)

      const photo = toPhoto(await response.json())
      if (!photo || photo.id !== id) {
        throw new StockPhotoError(
          `Unsplash returned an incomplete record for \`${id}\`, which cannot ` +
            'be attributed. Choose another.',
        )
      }
      return photo
    },

    async search({ orientation, page = 1, query }) {
      const trimmed = query.trim()
      if (!trimmed) throw new StockPhotoError('Give a search query.')

      const address = new URL('/search/photos', API_ORIGIN)
      address.searchParams.set('query', trimmed.slice(0, 100))
      address.searchParams.set('per_page', String(MAX_CANDIDATES))
      address.searchParams.set(
        'page',
        String(Math.min(Math.max(Math.trunc(page), 1), MAX_PAGE)),
      )
      address.searchParams.set('content_filter', 'high')
      if (orientation) address.searchParams.set('orientation', orientation)

      const response = await request(address)
      if (!response.ok) return refusal(response)

      const body = (await response.json()) as {
        results?: unknown
        total?: unknown
      }
      const photos = (Array.isArray(body.results) ? body.results : [])
        .map(toPhoto)
        .filter((photo): photo is UnsplashPhoto => photo !== null)
      const free = photos.filter(isFreeLicence)

      return {
        candidates: free.slice(0, MAX_CANDIDATES).map(toCandidate),
        omitted: photos.length - free.length,
        quotaRemaining: remainingQuota(response),
        total: number(body.total) ?? free.length,
      }
    },

    async trackDownload(photo) {
      // Fired once per photograph stored, never per search result: counting
      // views that were not downloads is the abuse the guideline is about.
      let address: URL
      try {
        address = new URL(photo.downloadLocation)
      } catch {
        return false
      }
      if (address.origin !== API_ORIGIN) return false

      try {
        const response = await request(address)
        return response.ok
      } catch {
        return false
      }
    },
  }
}
