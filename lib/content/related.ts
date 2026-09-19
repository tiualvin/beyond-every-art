// How many related posts a post page asks for, and who shows them.
//
// One surface now, where there were two. "Read next" closes the article on
// every device; the rail used to take a second helping of the same query and
// show it to desktop readers only, above the fold of a sticky group that could
// not hold it.
//
// That split is gone with the rail's "More on this" module (see
// `ArticleRail`), and with it `splitRelated`, `RAIL_COUNT`, and a query that
// asked for six posts to show three. Every piece the rail listed already
// closed the article below it, so nothing a reader can reach has changed —
// what changed is that the page reads three rows instead of six.

/** What "Read next" shows, and therefore what the page asks the database for. */
export const READ_NEXT_COUNT = 3
