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

  it('names the way out when the export is missing rather than blaming the parser', async () => {
    const errors: string[] = []
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation((line: unknown) => {
        errors.push(String(line))
      })

    await expect(main(['--input', 'no/such/ghost-export.json'])).resolves.toBe(
      1,
    )
    expect(errors.join('\n')).toContain('Could not read a Ghost export')
    expect(errors.join('\n')).toContain('GHOST_EXPORT_PATH')
    error.mockRestore()
  })

  // A rehearsal gate that dies with an unhandled rejection reads as a broken
  // run rather than an unwritable report, so the failure has to arrive as an
  // exit code with a sentence attached.
  it('reports an unwritable report path instead of throwing', async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), 'ghost-card-inventory-'),
    )
    const input = path.join(directory, 'ghost.json')
    const blocker = path.join(directory, 'blocker')
    await writeFile(
      input,
      JSON.stringify({ data: { posts: [{ slug: 'a', html: '<p>x</p>' }] } }),
    )
    // A file where the report's parent directory would go: `mkdir` cannot
    // create a directory underneath it, whoever the test runs as.
    await writeFile(blocker, 'not a directory')
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(
      main(['--input', input, '--json', path.join(blocker, 'report.json')]),
    ).resolves.toBe(1)
    expect(error.mock.calls[0]?.[0]).toContain(
      'Could not write the JSON report',
    )
    log.mockRestore()
    error.mockRestore()
  })
})
