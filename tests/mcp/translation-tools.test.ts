import { describe, expect, it, vi } from 'vitest'

import { LOCALIZED_TOOLS, mcpTools } from '../../lib/mcp/tools'
import {
  imagesIn,
  localeState,
  localized,
  untranslatedBlocks,
} from '../../lib/mcp/translation-tools'

const tool = (name: string) => {
  const found = mcpTools.find((candidate) => candidate.name === name)
  expect(found, name).toBeDefined()
  return found!
}

describe('locale on the article tools', () => {
  it('is offered by exactly the twelve tools that work in a language', () => {
    expect([...LOCALIZED_TOOLS].sort()).toEqual(
      [
        'convertLegacyArticle',
        'draftArticle',
        'editLegacyHtml',
        'listArticleVersions',
        'publishArticle',
        'readArticleMarkdown',
        'readArticleVersion',
        'readLegacyHtml',
        'setFAQBlock',
        'setKeyFactsBlock',
        'setTableBlock',
        'updateArticleMarkdown',
      ].sort(),
    )
    for (const name of LOCALIZED_TOOLS) {
      expect(tool(name).parameters, name).toHaveProperty('locale')
    }
    expect(tool('editorialStatus').parameters).toHaveProperty('locale')
    expect(tool('restoreArticleVersion').parameters).not.toHaveProperty(
      'locale',
    )
  })

  it('leaves a call without locale exactly as it was: same args, English', async () => {
    const handler = vi.fn(async () => ({
      content: [{ text: 'ok', type: 'text' as const }],
    }))
    const wrapped = localized({
      description: 'A tool that reads an article.',
      handler,
      name: 'example',
      parameters: {},
    })
    const req = { locale: undefined } as never as { locale?: string }
    await wrapped.handler({ id: '7', slug: 'blue' }, req as never, undefined)
    expect(handler).toHaveBeenCalledWith(
      { id: '7', slug: 'blue' },
      req,
      undefined,
    )
    expect(req.locale).toBe('en')
  })

  it('works in the language asked for, and refuses one that is not configured', async () => {
    const handler = vi.fn(async () => ({
      content: [{ text: 'ok', type: 'text' as const }],
    }))
    const wrapped = localized({
      description: 'A tool that reads an article.',
      handler,
      name: 'example',
      parameters: {},
    })
    const req = {} as { locale?: string }
    await wrapped.handler({ id: '7', locale: 'es' }, req as never, undefined)
    expect(req.locale).toBe('es')
    expect(handler).toHaveBeenCalledWith({ id: '7' }, req, undefined)
    await expect(
      wrapped.handler({ id: '7', locale: 'fr' }, {} as never, undefined),
    ).rejects.toThrow(/Unknown locale/)
  })
})

describe('saveTranslation', () => {
  it('refuses English before reading or writing anything', async () => {
    const payload = new Proxy(
      {},
      {
        get: () => {
          throw new Error('touched the database')
        },
      },
    )
    await expect(
      tool('saveTranslation').handler(
        { id: '1', locale: 'en', title: 'x', markdown: 'y' },
        { payload } as never,
        undefined,
      ),
    ).rejects.toThrow(/never English/)
  })
})

const faq = (id: string, question: string) => ({
  type: 'block',
  version: 2,
  format: '',
  fields: {
    id,
    blockName: '',
    blockType: 'faq',
    heading: '',
    items: [{ id: `${id}q`, question, answer: null }],
  },
})
const embed = (id: string) => ({
  type: 'block',
  version: 2,
  format: '',
  fields: {
    id,
    blockName: '',
    blockType: 'embed',
    url: 'https://example.com/v',
  },
})
const body = (...children: unknown[]) =>
  ({ root: { type: 'root', children } }) as never

describe('what a translation may not go live with', () => {
  it('finds modules still holding the English they were copied with', () => {
    const english = body(
      faq('a', 'Is it toxic?'),
      faq('b', 'Is it permanent?'),
      embed('c'),
    )
    const translated = body(
      faq('a', '¿Es tóxico?'),
      faq('b', 'Is it permanent?'),
      embed('c'),
    )
    expect(untranslatedBlocks(translated, english)).toEqual([
      { key: 'b', blockType: 'faq' },
    ])
  })

  it('lists every image an article shows: cover, body and modules', () => {
    const content = {
      root: {
        children: [
          { type: 'upload', relationTo: 'media', value: 5 },
          {
            type: 'block',
            fields: {
              blockType: 'gallery',
              items: [{ image: { id: 6 } }, { image: 7 }],
            },
          },
        ],
      },
    }
    expect(imagesIn(content, 4).sort()).toEqual([4, 5, 6, 7])
  })
})

describe('translationStatus', () => {
  const now = new Date('2026-11-17T12:00:00Z')
  const live = {
    _status: 'published',
    publishedAt: '2026-01-01T00:00:00Z',
    slug: { en: 'blue', es: 'azul' },
    modifiedAt: { en: '2026-05-01T00:00:00Z' },
    translationStatus: { es: 'published' },
    translationPublishedAt: { es: '2026-03-01T00:00:00Z' },
    translatedFrom: { es: { englishModifiedAt: '2026-02-01T00:00:00Z' } },
  }

  it('reports a live translation, its address, and that English moved on', () => {
    expect(localeState(live, live, 'es', now)).toEqual({
      state: 'published',
      slug: 'azul',
      url: expect.stringMatching(/\/es\/azul\/$/),
      publishedAt: '2026-03-01T00:00:00Z',
      englishChangedSince: true,
    })
  })

  it('tells a draft from a missing translation', () => {
    const newest = {
      ...live,
      title: { en: 'Blue', de: 'Blau' },
      translationStatus: { de: 'draft' },
    }
    expect(localeState(live, newest, 'de', now).state).toBe('draft')
    expect(localeState(live, newest, 'id', now).state).toBe('missing')
  })
})

describe('saved but not out, per language', () => {
  it('is a draft saved after the last publish, in that language only', async () => {
    const { pendingIn } = await import('../../lib/content/editorial-status')
    const live = {
      modifiedAt: { en: '2026-05-01T00:00:00Z', es: '2026-06-01T00:00:00Z' },
    }
    const spanishDraft = { draftedAt: { es: '2026-07-01T00:00:00Z' } }
    expect(pendingIn(spanishDraft, live, 'es')).toBe(true)
    // A Spanish draft is not English work waiting.
    expect(pendingIn(spanishDraft, live, 'en')).toBe(false)
    // Published since the last draft: nothing pending.
    expect(
      pendingIn({ draftedAt: { en: '2026-04-01T00:00:00Z' } }, live, 'en'),
    ).toBe(false)
  })
})
