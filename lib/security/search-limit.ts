import { configuredLimit, FixedWindowRateLimiter } from './rate-limit'

/**
 * The search page's allowance, shared by every language's search page so a
 * caller cannot double it by switching between `/search/` and `/es/search/`.
 *
 * Lower than the suggestion drawer's allowance, because this is the deliberate
 * act of submitting a search rather than the incidental traffic of typing one.
 *
 * Going over does not fail the page: the form, the heading and the chrome all
 * render as usual and only the results are withheld, so a reader who is merely
 * quick sees a message they can act on rather than an error page.
 */
export const searchPageLimiter = new FixedWindowRateLimiter(
  configuredLimit('RATE_LIMIT_SEARCH_PER_MINUTE', 30),
  60_000,
)
