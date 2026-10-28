// When an article's words last changed, as opposed to when its row last did.
//
// `dateModified` in Article JSON-LD, `article:modified_time` and the sitemap's
// `<lastmod>` all used `updatedAt`, which every save moves: adding one link,
// fixing a tag, rewriting the meta description. Google says it uses `lastmod`
// only when it is "consistently and verifiably accurate", and a date that
// moves on a link edit is neither — so the signal was being thrown away for the
// whole site, including on the edits that did matter.
//
// `contentUpdatedAt` moves only when the text a reader sees changes: the title,
// or the plain text of the body as the page renders it. Everything else — a
// link's target, bold or italic, a heading level, the excerpt, the meta fields,
// tags, the featured image — leaves it alone.
//
// **Compared against the live row, not `originalDoc`.** With drafts on, Payload
// hands `beforeChange` the latest *version* as `originalDoc`, which is usually
// the draft being published — so comparing against it would find no change on
// every publish. A draft save never writes the main row (Payload 3.90,
// `updateDocument`: the row is written only when `!isSavingDraft`), so the main
// row is exactly what the public site serves, and the right "before".

import type { CollectionBeforeChangeHook, PayloadRequest } from 'payload'

import { toArticleBody } from './body'
import { toIso } from './modified-at'
import { bodyToPlainText } from './plain-text'

type Doc = Record<string, unknown> | null | undefined

/** The value a field will hold after this write: Payload hands hooks a patch. */
function effective(key: string, data: Doc, original: Doc): unknown {
  const incoming = data?.[key]
  return incoming !== undefined ? incoming : original?.[key]
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

/**
 * Character references decoded, so `&amp;` and `&#38;` and `&` are one text.
 *
 * Which of them Ghost or an editor wrote is markup. Without this, re-saving
 * legacy HTML through a tool that normalises entities would count as a
 * rewrite of every article it touched.
 */
function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ref: string) => {
    if (ref[0] === '#') {
      const code =
        ref[1] === 'x' || ref[1] === 'X'
          ? parseInt(ref.slice(2), 16)
          : parseInt(ref.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole
    }
    return ENTITIES[ref.toLowerCase()] ?? whole
  })
}

/** Whitespace-, entity- and Unicode-form-insensitive, so only words count. */
function normalise(text: string): string {
  return decodeEntities(text).normalize('NFC').replace(/\s+/g, ' ').trim()
}

/**
 * The words a reader sees on the article: its title, then its body.
 *
 * The body goes through `toArticleBody`, the function the page itself renders
 * from, so this follows the page's rules rather than restating them: rich text
 * wins over `legacyHTML` when it has anything in it, a leading heading that
 * repeats the title is dropped, and an editor's HTML-comment notes and the
 * members-only marker are not text. Rendered unrestricted — a member reads the
 * whole piece, and an edit below the fold is still an edit.
 */
export function visibleText(doc: Doc): string {
  const title = typeof doc?.title === 'string' ? doc.title : ''
  const body = toArticleBody({
    title,
    content: doc?.content,
    legacyHTML: typeof doc?.legacyHTML === 'string' ? doc.legacyHTML : null,
  })
  return normalise(`${title}\n${bodyToPlainText(body)}`)
}

/** Whether the words changed between two states of an article. */
export function visibleTextChanged(before: Doc, after: Doc): boolean {
  return visibleText(before) !== visibleText(after)
}

/** Reads the row the public site serves for a post: the main row, not a draft. */
export type ReadLiveRow = (
  id: string | number,
  req: PayloadRequest,
) => Promise<Doc>

const readLiveRow: ReadLiveRow = async (id, req) => {
  try {
    return (await req.payload.findByID({
      collection: 'posts',
      id,
      // `draft: false` reads the main table. See the note at the top.
      draft: false,
      depth: 0,
      overrideAccess: true,
      trash: true,
      req,
      select: {
        title: true,
        content: true,
        legacyHTML: true,
        _status: true,
        contentUpdatedAt: true,
      },
    })) as Doc
  } catch {
    return null
  }
}

/**
 * Builds the `beforeChange` hook that owns `contentUpdatedAt`.
 *
 * The field is never taken from the incoming data: whatever an editor, a
 * script or an MCP call sends for it is replaced here, so the only way to move
 * it is to change the words. The rules, in order:
 *
 * 1. **A write that does not land published** (a draft save, an autosave, an
 *    unpublish) leaves the value where it was. Nothing a reader sees changed.
 * 2. **The first publish** — no live row, or a live row that was never
 *    published and has no value — takes the publication date.
 * 3. **A published write whose visible text differs from the live row's** takes
 *    the current time.
 * 4. **Anything else** keeps the live row's value: a link, a tag, a meta
 *    description, or a republish of identical text.
 *
 * Factored as a builder so the tests can supply the live row and the clock.
 */
export function buildStampContentUpdatedAt({
  readLive = readLiveRow,
  now = () => new Date(),
}: {
  readLive?: ReadLiveRow
  now?: () => Date
} = {}): CollectionBeforeChangeHook {
  return async ({ data, originalDoc, operation, req }) => {
    const original = originalDoc as Doc
    const status = effective('_status', data, original)
    const previous = toIso(original?.contentUpdatedAt)

    if (status !== 'published') {
      return { ...data, contentUpdatedAt: previous }
    }

    const live =
      operation === 'update' && original?.id !== undefined
        ? await readLive(original.id as string | number, req)
        : null
    const liveValue = toIso(live?.contentUpdatedAt)

    if (!liveValue && live?._status !== 'published') {
      const publishedAt = toIso(effective('publishedAt', data, original))
      return { ...data, contentUpdatedAt: publishedAt ?? now().toISOString() }
    }

    const after = {
      title: effective('title', data, original),
      content: effective('content', data, original),
      legacyHTML: effective('legacyHTML', data, original),
    }
    if (visibleTextChanged(live, after)) {
      return { ...data, contentUpdatedAt: now().toISOString() }
    }

    // A published row the backfill has not reached keeps its null, and keeps
    // falling back to `updatedAt` until it does — see `contentModifiedAt`.
    return { ...data, contentUpdatedAt: liveValue }
  }
}

/** The hook `collections/Posts.ts` runs. */
export const stampContentUpdatedAt = buildStampContentUpdatedAt()

/** One published version of a post, as the backfill reads it. */
export type PublishedVersion = {
  /** When the version was written: the moment it went live. */
  at: string
  title?: unknown
  content?: unknown
  legacyHTML?: unknown
  /** Anything else the version holds, which the rule does not read. */
  [field: string]: unknown
}

export type BackfillDecision = {
  /** The value to store, or null when the post has no date to give. */
  contentUpdatedAt: string | null
  /**
   * Why. `changed`: a published version's text differs from the one before
   * it. `unchanged`: none does, so the text is what was first published.
   * `no-history`: fewer than two published versions to compare.
   */
  reason: 'changed' | 'unchanged' | 'no-history'
}

/**
 * The backfill rule: the latest published version whose visible text differs
 * from the published version before it, else the publication date.
 *
 * **Published versions only.** A draft's text was never on the site, so the
 * moment a draft was saved is not a moment the page changed; the publish that
 * carried it is. Comparing published versions with each other dates every
 * change to when readers first saw it.
 *
 * **Never before `publishedAt`**, for the reason `contentModifiedAt` gives.
 *
 * **What it cannot see.** Payload keeps 50 versions per post
 * (`versions.maxPerDoc`), and autosave spends them quickly, so a post's oldest
 * published versions may be gone. The comparison only ever looks between
 * versions that both survive, so a change older than the window falls back to
 * `publishedAt` — an older date than the truth, never a newer one. And a
 * migrated article's edits in Ghost were never versions here at all: the
 * import is its first version, so it reads as unchanged since its Ghost
 * publication date.
 */
export function backfillContentUpdatedAt({
  versions,
  publishedAt,
}: {
  versions: readonly PublishedVersion[]
  publishedAt: unknown
}): BackfillDecision {
  const published = toIso(publishedAt)
  const ordered = versions
    .map((version) => ({ ...version, at: toIso(version.at) }))
    .filter((version): version is PublishedVersion & { at: string } =>
      Boolean(version.at),
    )
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))

  let changedAt: string | null = null
  for (let index = 1; index < ordered.length; index++) {
    if (visibleTextChanged(ordered[index - 1], ordered[index])) {
      changedAt = ordered[index].at
    }
  }

  const reason: BackfillDecision['reason'] = changedAt
    ? 'changed'
    : ordered.length < 2
      ? 'no-history'
      : 'unchanged'
  const date = changedAt ?? published ?? ordered[0]?.at ?? null
  const contentUpdatedAt =
    date && published && published > date ? published : date

  return { contentUpdatedAt, reason }
}
