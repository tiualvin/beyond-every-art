// How "Read next" and the in-body house slots choose what to show.
//
// They used to take other posts under the same tags, newest first, and top a
// thin match up with the newest posts on the site. On a publication whose tags
// are three broad shelves — "Art" alone is on two thirds of the archive — that
// is "the newest posts" with extra steps. Measured on 24 Oct 2026 across the
// 161 live articles: "Read next" pointed at 25 posts in total, the three newest
// sat on about 110 pages each, 75 of the 113 migrated articles showed exactly
// those three, and only six migrated articles appeared in anybody's list. The
// pages search engines actually send readers to — almost all of them older
// than October — were linking forward to whatever had been published that
// week, and nothing linked back to them.
//
// So the pool is now ranked by relevance, from three signals, in this order of
// weight:
//
// 1. **Shared words in the title and slug**, weighted by how rare each word is
//    across the live archive (inverse document frequency) and compared as a
//    cosine, so "gouache" or "purple" counts for a lot and "color" for little,
//    and a long title cannot win merely by having more words in it. Function
//    words and the words every article on an art site shares ("art", "artist",
//    "guide") are dropped before counting; plurals are folded so "pigments"
//    meets "pigment". The slug is read as well as the title because it is
//    where an editor put the search terms when the headline is a hook — "The
//    Technique With No Edges" is `sfumato-leonardo-technique-explained`.
// 2. **Shared tags**, weighted the same way, so a tag on most of the archive
//    adds almost nothing and a narrow one ("Music", "Exhibitions") a good deal.
//    A workflow tag (`featured`, see `topics.ts`) is not a subject and counts
//    for nothing.
// 3. **A small recency term**, worth less than any shared word or narrow tag,
//    which only orders candidates that are otherwise equal.
//
// No age limit and no age penalty beyond that tiebreak: a migrated article from
// 2025 is exactly as eligible as last week's, which is the point.
//
// **Variety.** Many pages have dozens of candidates that are, as far as titles
// and tags can tell, equally related — two articles that share nothing but the
// "Art" tag. A deterministic order among those (newest first, alphabetical)
// hands every such page the same three, which is the defect this replaces. So
// near-ties are broken by a hash of the page's own slug and the candidate's:
// fixed for a given page, different from one page to the next, and never
// random per render — the same article shows the same list until its
// candidates change, which keeps the cached read and a crawler's view of the
// page stable. The jitter is bounded below the weight of one shared narrow tag,
// so it reorders near-ties and cannot promote an unrelated piece over a related
// one.
//
// Pure on purpose: no Payload, no cache, no clock unless one is passed. The
// query in `queries.ts` loads the candidates once and hands them here, and
// `scripts/audit-related.ts` runs the same function over every live post to
// report what the site as a whole is linking to.

import { isSubjectTag } from './topics'

/** What ranking needs to know about a post: no body, no image. */
export type RelatedCandidate = {
  slug: string
  title: string
  /** Tag slugs, in any order. */
  tags: string[]
  publishedAt: string | null
}

/** The post a list is being chosen for. Its title may be unknown (a draft). */
export type RelatedSubject = {
  slug: string
  title?: string | null
  tags: string[]
}

/**
 * The weights, together, so their relative sizes can be read at a glance.
 *
 * Both similarities run from 0 to 1, but they are not on the same footing. A
 * title has five or six meaningful words, so one rare word in common already
 * scores about 0.2; a post has one or two tags, so two posts filed under "Art"
 * alone score a perfect 1. Tags are therefore weighted at a seventh: one shared
 * word like "acrylic" or "sculpture" beats an identical set of broad tags, and
 * tags still decide between candidates that share no word at all — which on
 * most pages is most of them.
 *
 * The two tiebreaks together stay below what one shared rare word is worth, so
 * they reorder near-ties and never promote an unrelated piece over a related
 * one. `tests/content/related-rank.test.ts` holds both of those orderings.
 */
export const RELATED_WEIGHTS = {
  terms: 1,
  tags: 0.15,
  /** At most this much for a piece published today, halving every `recencyHalfLifeDays`. */
  recency: 0.02,
  recencyHalfLifeDays: 180,
  /** Spread across near-ties: a fixed per-page offset in [0, this). */
  variety: 0.05,
} as const

/**
 * Words that say nothing about what an article on this site is about.
 *
 * English function words, the question words headlines open with, and the
 * vocabulary every article here shares. Kept short and literal: a rare word
 * is already worth more than a common one through the document frequency, so
 * this list only has to remove words that would otherwise read as a topic.
 */
const STOPWORDS = new Set(
  [
    // Function words.
    'a about after again all also an and any are as at be been before',
    'being between both but by can cant could did didnt do does doesnt',
    'dont down each even ever every few for from had has have he her',
    'here his if in into is isnt it its just like many may me might',
    'more most much must my no nor not of off on once one only or other',
    'our out over own same she should so some such than that thats the',
    'their them then there these they this those through to too under',
    'until up us very vs versus was wasnt we were will with within',
    'without would you youll your youre youve',
    // How a headline asks.
    'how what whats when where which who why',
    // Verbs and qualifiers headlines lean on whatever the subject: "Why X
    // Behaves Differently", "What Every Artist Needs", "How Y Creates Z".
    'become behave change create different differently difficult feel',
    'get know learn look made make making matter mean meaning need never',
    'new think',
    'use using worth wrong',
    // Spans of time: "for Thousands of Years" and "Took a Thousand Years" are
    // not one subject.
    'century decade hundred thousand year',
    // What every article on this site is.
    'actually art artist artwork complete explained guide really simply',
    'thing way work',
  ]
    .join(' ')
    .split(' '),
)

/**
 * The stopwords as `foldWord` leaves them, so "Creates", "Needs" and "Changes"
 * are stopped by "create", "need" and "change" without listing every form.
 */
const FOLDED_STOPWORDS = new Set([...STOPWORDS].map((word) => foldWord(word)))

/**
 * One word reduced to the form two titles should agree on.
 *
 * Three folds and no more. Plurals: "galleries" and "gallery", "pigments" and
 * "pigment". A final `e`, so "price" becomes `pric` — the result is a key,
 * not a word, and nobody reads it. And `-ing`, but only where the stem ends
 * on a letter English words do not end on without a silent `e` (c, g, v, z),
 * so "pricing" meets "price", "carving" meets "carve" and "smudging" meets
 * "smudge", while "yellowing" stays apart from "yellow" — a varnish defect is
 * not the colour — and "painting" from "paint". "Glass", "chiaroscuro" and
 * "thing" are left alone.
 */
export function foldWord(word: string): string {
  let folded = word
  if (folded.length > 4 && folded.endsWith('ies')) {
    folded = `${folded.slice(0, -3)}y`
  } else if (/(?:ss|x|ch|sh)es$/.test(folded)) {
    folded = folded.slice(0, -2)
  } else if (
    folded.length > 3 &&
    folded.endsWith('s') &&
    !/(?:ss|us|is)$/.test(folded)
  ) {
    folded = folded.slice(0, -1)
  }

  const stem = folded.slice(0, -3)
  if (
    folded.endsWith('ing') &&
    stem.length >= 3 &&
    /[aeiouy]/.test(stem) &&
    /[cgvz]$/.test(stem)
  ) {
    folded = stem
  }
  if (folded.length > 3 && folded.endsWith('e') && !folded.endsWith('ee')) {
    folded = folded.slice(0, -1)
  }
  return folded
}

/**
 * The meaningful words in a post's title and slug, as a set.
 *
 * Apostrophes join rather than split — "Artist's" is one word — and diacritics
 * fold, the same way heading anchors are made (`headings.ts`). Numbers are
 * kept only when they look like a year: "1533" says which painting, "2" says
 * nothing.
 */
export function termsOf(slug: string, title?: string | null): Set<string> {
  const words = `${title ?? ''} ${slug.replace(/-/g, ' ')}`
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^a-z0-9]+/)

  const terms = new Set<string>()
  for (const word of words) {
    if (!word) continue
    if (/^\d+$/.test(word) && word.length !== 4) continue
    if (!/^\d+$/.test(word) && word.length < 3) continue
    if (STOPWORDS.has(word)) continue
    const folded = foldWord(word)
    if (FOLDED_STOPWORDS.has(folded)) continue
    terms.add(folded)
  }
  return terms
}

/** The subject tags of a post, deduplicated (Ghost left a few doubled). */
function subjectTagSet(tags: string[]): Set<string> {
  return new Set(tags.filter((tag) => tag && isSubjectTag(tag)))
}

/**
 * How rare each key is among `sets`, as a weight: rarer is heavier.
 *
 * `ln(1 + N / df)` rather than the textbook `ln(N / df)`, so a key every post
 * carries still weighs something above zero instead of vanishing, and a key
 * no post carries cannot divide by zero.
 */
function inverseFrequency(sets: Set<string>[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const set of sets) {
    for (const key of set) counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const weights = new Map<string, number>()
  for (const [key, count] of counts) {
    weights.set(key, Math.log(1 + sets.length / count))
  }
  return weights
}

/** Cosine similarity of two weighted sets: 0 for nothing shared, 1 for identical. */
function cosine(
  a: Set<string>,
  b: Set<string>,
  weights: Map<string, number>,
): number {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const key of a) {
    if (b.has(key)) shared += (weights.get(key) ?? 0) ** 2
  }
  if (shared === 0) return 0
  return shared / (norm(a, weights) * norm(b, weights))
}

function norm(set: Set<string>, weights: Map<string, number>): number {
  let sum = 0
  for (const key of set) sum += (weights.get(key) ?? 0) ** 2
  return Math.sqrt(sum)
}

/**
 * A number in [0, 1) fixed by the two slugs, and nothing else.
 *
 * FNV-1a over both, so the same pair always lands in the same place and a
 * different page puts the same candidate somewhere else, then MurmurHash3's
 * 32-bit finaliser. The finaliser is not decoration: FNV-1a alone barely moves
 * its high bits when only the last characters differ — `piece-1` against
 * `piece-2` — and the high bits are the ones dividing by 2³² reads, so
 * without it pages with similar slugs agreed on their near-ties and the spread
 * this exists for collapsed. Not cryptographic and not meant to be: it only
 * has to spread evenly and never change.
 */
export function pairSeed(pageSlug: string, candidateSlug: string): number {
  let hash = 0x811c9dc5
  const input = `${pageSlug}\u0000${candidateSlug}`
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x85ebca6b)
  hash ^= hash >>> 13
  hash = Math.imul(hash, 0xc2b2ae35)
  hash ^= hash >>> 16
  return (hash >>> 0) / 0x100000000
}

/** The small bonus for being recent, at most `RELATED_WEIGHTS.recency`. */
function recencyBonus(publishedAt: string | null, now: Date): number {
  const at = publishedAt ? Date.parse(publishedAt) : Number.NaN
  if (!Number.isFinite(at)) return 0
  const days = Math.max(0, (now.getTime() - at) / 86_400_000)
  return (
    RELATED_WEIGHTS.recency * 2 ** (-days / RELATED_WEIGHTS.recencyHalfLifeDays)
  )
}

/** A candidate with the parts of its score kept apart, for tests and the audit. */
export type ScoredCandidate<T extends RelatedCandidate = RelatedCandidate> = {
  candidate: T
  /** Title-and-slug cosine, 0–1. */
  terms: number
  /** Tag cosine, 0–1. */
  tags: number
  /** What the two above are worth together: the part that is about topic. */
  relevance: number
  /** Relevance plus both tiebreaks: what the list is sorted on. */
  score: number
}

/**
 * Every candidate scored for `subject`, best first, the subject itself left out.
 *
 * Document frequencies are taken over the candidates passed — the live
 * archive — plus the subject when it is not among them (a draft being
 * previewed), so a word is rare or common relative to what is actually on the
 * site. Ties on `score` (vanishingly rare after the seeded term) fall back to
 * the slug, so the order is total and identical on every run.
 */
export function scoreRelated<T extends RelatedCandidate>(
  subject: RelatedSubject,
  candidates: T[],
  now: Date = new Date(),
): ScoredCandidate<T>[] {
  const own = candidates.find((candidate) => candidate.slug === subject.slug)
  const subjectTerms = termsOf(subject.slug, subject.title ?? own?.title)
  const subjectTags = subjectTagSet(
    subject.tags.length ? subject.tags : (own?.tags ?? []),
  )

  const termSets = candidates.map((c) => termsOf(c.slug, c.title))
  const tagSets = candidates.map((c) => subjectTagSet(c.tags))
  const corpusTerms = own ? termSets : [...termSets, subjectTerms]
  const corpusTags = own ? tagSets : [...tagSets, subjectTags]
  const termWeights = inverseFrequency(corpusTerms)
  const tagWeights = inverseFrequency(corpusTags)

  const scored: ScoredCandidate<T>[] = []
  candidates.forEach((candidate, index) => {
    if (candidate.slug === subject.slug) return
    const terms = cosine(subjectTerms, termSets[index], termWeights)
    const tags = cosine(subjectTags, tagSets[index], tagWeights)
    const relevance =
      RELATED_WEIGHTS.terms * terms + RELATED_WEIGHTS.tags * tags
    const score =
      relevance +
      recencyBonus(candidate.publishedAt, now) +
      RELATED_WEIGHTS.variety * pairSeed(subject.slug, candidate.slug)
    scored.push({ candidate, terms, tags, relevance, score })
  })

  return scored.sort(
    (a, b) =>
      b.score - a.score || a.candidate.slug.localeCompare(b.candidate.slug),
  )
}

/** The `limit` best candidates for `subject`, in the order they should show. */
export function rankRelated<T extends RelatedCandidate>(
  subject: RelatedSubject,
  candidates: T[],
  limit: number,
  now: Date = new Date(),
): T[] {
  return scoreRelated(subject, candidates, now)
    .slice(0, Math.max(0, limit))
    .map(({ candidate }) => candidate)
}
