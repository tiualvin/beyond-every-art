/** Formats a date as e.g. "May 20, 2025". Returns an empty string for
 * missing or unparseable input so it is safe to call directly in JSX. */
export function formatDate(
  value: string | number | Date | null | undefined,
  locale = 'en-US',
): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/** Rough reading-time estimate in whole minutes (min 1) from a word count. */
export function readingTimeMinutes(wordCount: number, wpm = 220): number {
  if (!Number.isFinite(wordCount) || wordCount <= 0) return 1
  return Math.max(1, Math.round(wordCount / wpm))
}
