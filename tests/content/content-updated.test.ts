import type { PayloadRequest } from 'payload'
import { describe, expect, it } from 'vitest'

import {
  backfillContentUpdatedAt,
  buildStampContentUpdatedAt,
  visibleText,
  visibleTextChanged,
} from '../../lib/content/content-updated'
import { contentModifiedAt } from '../../lib/content/modified-at'

// --- Lexical fixtures ----------------------------------------------------

const text = (value: string, format = 0) => ({
  type: 'text',
  text: value,
  format,
  version: 1,
})
const link = (url: string, value: string) => ({
  type: 'link',
  fields: { url, linkType: 'custom', newTab: false },
  children: [text(value)],
  version: 3,
})
const paragraph = (...children: unknown[]) => ({
  type: 'paragraph',
  children,
  version: 1,
})
const heading = (tag: string, value: string) => ({
  type: 'heading',
  tag,
  children: [text(value)],
  version: 1,
})
const rich = (...children: unknown[]) => ({
  root: { type: 'root', children, version: 1 },
})

const TITLE = 'What Ultramarine Cost'
const body = rich(
  paragraph(
    text('Lapis came from '),
    link('https://a.example/', 'Badakhshan'),
    text('.'),
  ),
)

describe('visibleText', () => {
  it('is the title and the words of the body', () => {
    expect(visibleText({ title: TITLE, content: body })).toBe(
      'What Ultramarine Cost Lapis came from Badakhshan.',
    )
  })

  it('reads legacy HTML when the rich text is empty, as the page does', () => {
    expect(
      visibleText({
        title: TITLE,
        content: rich(),
        legacyHTML: '<p>Lapis &amp; <a href="/x/">gold</a></p>',
      }),
    ).toBe('What Ultramarine Cost Lapis & gold')
  })

  // The page drops a leading heading that repeats the title; so does this.
  it('ignores a leading heading that only repeats the title', () => {
    const withHeading = rich(heading('h1', TITLE), ...body.root.children)
    expect(
      visibleTextChanged(
        { title: TITLE, content: body },
        { title: TITLE, content: withHeading },
      ),
    ).toBe(false)
  })
})

describe('visibleTextChanged', () => {
  const before = { title: TITLE, content: body, excerpt: 'Old', metaTitle: 'A' }

  it('ignores a link whose target changes but whose words do not', () => {
    const after = {
      ...before,
      content: rich(
        paragraph(
          text('Lapis came from '),
          link('https://b.example/', 'Badakhshan'),
          text('.'),
        ),
      ),
    }
    expect(visibleTextChanged(before, after)).toBe(false)
  })

  it('ignores adding a link around words that were already there', () => {
    const plain = rich(paragraph(text('Lapis came from Badakhshan.')))
    expect(visibleTextChanged({ title: TITLE, content: plain }, before)).toBe(
      false,
    )
  })

  it('ignores formatting: bold, italic, a heading level', () => {
    const bold = rich(
      paragraph(
        text('Lapis came from ', 1),
        link('https://a.example/', 'Badakhshan'),
        text('.', 2),
      ),
    )
    expect(visibleTextChanged(before, { ...before, content: bold })).toBe(false)
    expect(
      visibleTextChanged(
        {
          title: TITLE,
          content: rich(heading('h2', 'Trade'), paragraph(text('x'))),
        },
        {
          title: TITLE,
          content: rich(heading('h3', 'Trade'), paragraph(text('x'))),
        },
      ),
    ).toBe(false)
  })

  it('ignores markup-only and whitespace-only HTML edits', () => {
    expect(
      visibleTextChanged(
        { title: TITLE, legacyHTML: '<p>Lapis &amp; gold</p>' },
        {
          title: TITLE,
          legacyHTML: '<p class="x">Lapis\n  &#38; <strong>gold</strong></p>',
        },
      ),
    ).toBe(false)
  })

  it('ignores fields a reader does not read as the article', () => {
    expect(
      visibleTextChanged(before, {
        ...before,
        excerpt: 'New',
        metaTitle: 'B',
        tags: [1, 2],
      }),
    ).toBe(false)
  })

  it('sees a changed word in the body', () => {
    const after = {
      ...before,
      content: rich(
        paragraph(
          text('Lapis came from '),
          link('https://a.example/', 'Afghanistan'),
          text('.'),
        ),
      ),
    }
    expect(visibleTextChanged(before, after)).toBe(true)
  })

  it('sees a changed title', () => {
    expect(
      visibleTextChanged(before, { ...before, title: 'What Lapis Cost' }),
    ).toBe(true)
  })
})

// --- The hook --------------------------------------------------------------

const NOW = '2026-10-28T12:00:00.000Z'
const PUBLISHED = '2026-01-10T09:00:00.000Z'
const EARLIER = '2026-03-01T09:00:00.000Z'
const req = {} as PayloadRequest

function run({
  live,
  data,
  originalDoc,
  operation = 'update',
}: {
  live: Record<string, unknown> | null
  data: Record<string, unknown>
  originalDoc?: Record<string, unknown>
  operation?: 'create' | 'update'
}) {
  const hook = buildStampContentUpdatedAt({
    readLive: async () => live,
    now: () => new Date(NOW),
  })
  return hook({
    data,
    originalDoc: originalDoc as never,
    operation,
    req,
    collection: {} as never,
    context: {},
  }) as Promise<Record<string, unknown>>
}

const liveRow = {
  id: 7,
  _status: 'published',
  title: TITLE,
  content: body,
  contentUpdatedAt: EARLIER,
}

describe('stampContentUpdatedAt', () => {
  it('leaves the value alone on a draft save, whatever the draft says', async () => {
    const result = await run({
      live: liveRow,
      data: { _status: 'draft', title: 'Rewritten', contentUpdatedAt: NOW },
      originalDoc: { ...liveRow, _status: 'draft' },
    })
    expect(result.contentUpdatedAt).toBe(EARLIER)
  })

  it('moves to now when a publish changes the words', async () => {
    const result = await run({
      live: liveRow,
      data: { _status: 'published', title: 'What Lapis Cost' },
      originalDoc: liveRow,
    })
    expect(result.contentUpdatedAt).toBe(NOW)
  })

  // The case `originalDoc` alone gets wrong: it is the latest version — the
  // very draft being published — so it already holds the new words.
  it('compares with the live row, not the draft being published', async () => {
    const draft = { ...liveRow, _status: 'draft', title: 'What Lapis Cost' }
    const result = await run({
      live: liveRow,
      data: { _status: 'published' },
      originalDoc: draft,
    })
    expect(result.contentUpdatedAt).toBe(NOW)
  })

  it('keeps the live value for a link-only or metadata-only publish', async () => {
    const result = await run({
      live: liveRow,
      data: {
        _status: 'published',
        metaDescription: 'New',
        content: rich(
          paragraph(
            text('Lapis came from '),
            link('https://b.example/', 'Badakhshan'),
            text('.'),
          ),
        ),
        contentUpdatedAt: NOW,
      },
      originalDoc: liveRow,
    })
    expect(result.contentUpdatedAt).toBe(EARLIER)
  })

  // A save that sends no `_status` lands on the status it already had.
  it('treats a patch with no status as the status it already had', async () => {
    const result = await run({
      live: liveRow,
      data: { title: 'What Lapis Cost' },
      originalDoc: liveRow,
    })
    expect(result.contentUpdatedAt).toBe(NOW)
  })

  it('takes the publication date on a first publish', async () => {
    const draft = {
      id: 7,
      _status: 'draft',
      title: TITLE,
      publishedAt: PUBLISHED,
    }
    const result = await run({
      live: draft,
      data: { _status: 'published' },
      originalDoc: draft,
    })
    expect(result.contentUpdatedAt).toBe(PUBLISHED)
  })

  it('takes the publication date when a post is created published', async () => {
    const result = await run({
      live: null,
      operation: 'create',
      data: { _status: 'published', title: TITLE, publishedAt: PUBLISHED },
    })
    expect(result.contentUpdatedAt).toBe(PUBLISHED)
  })

  // Not yet backfilled: keeps null, so readers keep falling back to
  // `updatedAt` rather than jumping backwards — see `contentModifiedAt`.
  it('keeps a not-yet-backfilled row null when the words did not change', async () => {
    const legacy = { ...liveRow, contentUpdatedAt: null }
    const result = await run({
      live: legacy,
      data: { _status: 'published', excerpt: 'New' },
      originalDoc: legacy,
    })
    expect(result.contentUpdatedAt).toBeNull()
  })
})

// --- The reader --------------------------------------------------------------

describe('contentModifiedAt', () => {
  it('is contentUpdatedAt, not updatedAt', () => {
    expect(
      contentModifiedAt({
        contentUpdatedAt: EARLIER,
        updatedAt: NOW,
        publishedAt: PUBLISHED,
      }),
    ).toBe(EARLIER)
  })

  it('falls back to updatedAt for a row the backfill has not reached', () => {
    expect(
      contentModifiedAt({
        contentUpdatedAt: null,
        updatedAt: NOW,
        publishedAt: PUBLISHED,
      }),
    ).toBe(NOW)
  })

  it('is never earlier than the publication date', () => {
    expect(
      contentModifiedAt({ contentUpdatedAt: PUBLISHED, publishedAt: EARLIER }),
    ).toBe(EARLIER)
  })

  it('is the publication date when that is all there is', () => {
    expect(contentModifiedAt({ publishedAt: PUBLISHED })).toBe(PUBLISHED)
    expect(contentModifiedAt({})).toBeNull()
  })
})

// --- The backfill rule ---------------------------------------------------------

describe('backfillContentUpdatedAt', () => {
  const v = (at: string, title: string, words: string) => ({
    at,
    title,
    content: rich(paragraph(text(words))),
  })

  it('is the latest published version whose words differ from the one before', () => {
    const decision = backfillContentUpdatedAt({
      publishedAt: PUBLISHED,
      versions: [
        v('2026-01-10T09:00:00.000Z', TITLE, 'one'),
        v('2026-02-01T09:00:00.000Z', TITLE, 'two'),
        v('2026-03-01T09:00:00.000Z', TITLE, 'three'),
        // A metadata-only republish after the last real change.
        { ...v('2026-04-01T09:00:00.000Z', TITLE, 'three'), excerpt: 'x' },
      ],
    })
    expect(decision).toEqual({
      contentUpdatedAt: '2026-03-01T09:00:00.000Z',
      reason: 'changed',
    })
  })

  it('reads versions in date order, whatever order they arrive in', () => {
    const decision = backfillContentUpdatedAt({
      publishedAt: PUBLISHED,
      versions: [
        v('2026-03-01T09:00:00.000Z', TITLE, 'two'),
        v('2026-01-10T09:00:00.000Z', TITLE, 'one'),
      ],
    })
    expect(decision.contentUpdatedAt).toBe('2026-03-01T09:00:00.000Z')
  })

  it('falls back to the publication date when nothing changed', () => {
    expect(
      backfillContentUpdatedAt({
        publishedAt: PUBLISHED,
        versions: [
          v('2026-02-01T09:00:00.000Z', TITLE, 'same'),
          v('2026-03-01T09:00:00.000Z', TITLE, 'same'),
        ],
      }),
    ).toEqual({ contentUpdatedAt: PUBLISHED, reason: 'unchanged' })
  })

  it('falls back to the publication date with a single version', () => {
    expect(
      backfillContentUpdatedAt({
        publishedAt: PUBLISHED,
        versions: [v('2026-09-20T09:00:00.000Z', TITLE, 'imported')],
      }),
    ).toEqual({ contentUpdatedAt: PUBLISHED, reason: 'no-history' })
  })

  it('is never earlier than the publication date', () => {
    expect(
      backfillContentUpdatedAt({
        publishedAt: '2026-06-01T00:00:00.000Z',
        versions: [
          v('2026-01-01T00:00:00.000Z', TITLE, 'a'),
          v('2026-02-01T00:00:00.000Z', TITLE, 'b'),
        ],
      }).contentUpdatedAt,
    ).toBe('2026-06-01T00:00:00.000Z')
  })
})
