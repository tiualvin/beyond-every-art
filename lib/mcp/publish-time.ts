// When a publish should land, from what a tool call asked for. Shared by
// `publishArticle` in English and in a translated language.

/** An ISO 8601 time that names its offset, so "20:00" cannot mean two things. */
const ZONED_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i

/**
 * `publishAt` as a time, or undefined when the call left it out.
 *
 * Only "now" or a moment ahead. A date in the past would put an article out
 * backdated — filed below newer work in every listing and the feed — which is
 * an editorial decision about history, made in the admin panel.
 */
export function resolvePublishAt(
  value: string | undefined,
  now: Date = new Date(),
): string | undefined {
  if (value === undefined) return undefined
  const trimmed = value.trim()
  if (trimmed.toLowerCase() === 'now') return now.toISOString()
  if (!ZONED_TIME.test(trimmed)) {
    throw new Error(
      '`publishAt` must be "now" or an ISO 8601 time with its offset, such ' +
        'as 2026-11-04T20:00:00Z.',
    )
  }
  const at = Date.parse(trimmed)
  if (!Number.isFinite(at))
    throw new Error(`\`publishAt\` is not a time: ${value}`)
  if (at <= now.getTime()) {
    throw new Error(
      `\`publishAt\` (${trimmed}) has passed. Pass "now" to publish today, or ` +
        'a time ahead to schedule. Backdating is done in the admin panel.',
    )
  }
  return new Date(at).toISOString()
}
