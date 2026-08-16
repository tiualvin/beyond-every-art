import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { inventoryGhostCards } from '../../lib/migration/card-inventory'
import { main, parseArgs } from '../../scripts/inventory-ghost-cards'

describe('Ghost card inventory', () => {
  it('counts covered, unhandled, unknown, and raw HTML cards without retaining bodies', () => {
    const inventory = inventoryGhostCards({
      db: [
        {
          data: {
            posts: [
              {
                slug: 'first',
                html: '<figure class="kg-callout-card kg-callout-card-blue"></figure><figure class="kg-audio-card"></figure><!--kg-card-begin: html--><p>private body</p>',
              },
              {
                slug: 'second',
                html: '<div class="kg-callout-card"></div><div class="kg-future-card"></div>',
              },
            ],
            pages: [{ slug: 'about', html: '<p>Plain prose</p>' }],
          },
        },
      ],
    })

    expect(inventory).toMatchObject({
      documents: 3,
      documentsWithCards: 2,
      rawHTMLCards: 1,
      unhandledCards: 1,
      unknownCards: 1,
      ok: false,
    })
    expect(inventory.cards).toEqual([
      expect.objectContaining({
        card: 'kg-callout-card',
        uses: 2,
        documents: 2,
        status: 'covered',
      }),
      expect.objectContaining({
        card: 'kg-audio-card',
        uses: 1,
        status: 'unhandled',
      }),
      expect.objectContaining({
        card: 'kg-future-card',
        uses: 1,
        status: 'unknown',
      }),
    ])
    expect(JSON.stringify(inventory)).not.toContain('private body')
  })

  it('supports the flat Ghost export shape and treats raw HTML as preserved evidence', () => {
    expect(
      inventoryGhostCards({
        data: {
          posts: [
            {
              slug: 'html',
              html: '<!--kg-card-begin: html--><aside>Custom</aside>',
            },
          ],
          pages: [],
        },
      }),
    ).toMatchObject({ documents: 1, rawHTMLCards: 1, cards: [], ok: true })
  })

  it('rejects files without posts or pages', () => {
    expect(() => inventoryGhostCards({ data: { tags: [] } })).toThrow(
      'held no posts or pages',
    )
  })

  it('parses strict CLI options and aliases', () => {
    expect(
      parseArgs([
        '--',
        '--input',
        'ghost.json',
        '--examples',
        '--json',
        'report.json',
        '--fail-on-unhandled',
      ]),
    ).toMatchObject({
      exportPath: 'ghost.json',
      examples: true,
      jsonPath: 'report.json',
      failOnUnhandled: true,
    })
    expect(() => parseArgs(['--wat'])).toThrow('Unknown or incomplete argument')
  })

  it('writes a private report and fails strict mode for migration gaps', async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), 'ghost-card-inventory-'),
    )
    const input = path.join(directory, 'ghost.json')
    const report = path.join(directory, 'reports', 'inventory.json')
    await writeFile(
      input,
      JSON.stringify({
        data: {
          posts: [
            {
              slug: 'audio',
              html: '<div class="kg-audio-card">body</div>',
            },
          ],
          pages: [],
        },
      }),
    )
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await expect(
      main(['--input', input, '--json', report, '--fail-on-unhandled']),
    ).resolves.toBe(1)
    expect(JSON.parse(await readFile(report, 'utf8'))).toMatchObject({
      ok: false,
      unhandledCards: 1,
    })
    expect((await stat(report)).mode & 0o777).toBe(0o600)
    log.mockRestore()
  })
})
