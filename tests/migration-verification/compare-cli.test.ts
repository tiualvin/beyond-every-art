import { describe, expect, it } from 'vitest'

import { parseArgs } from '../../scripts/compare-sites'

describe('migration comparator CLI', () => {
  it('keeps default reports together in the ignored private artifact directory', () => {
    const options = parseArgs([
      '--source',
      'https://source.example',
      '--target',
      'https://target.example',
    ])

    expect(options).toMatchObject({
      jsonPath: '.migration-reports/site-comparison.json',
      reportPath: '.migration-reports/site-comparison.txt',
    })
  })

  it('accepts an explicit independent target page budget', () => {
    const options = parseArgs([
      '--source',
      'https://source.example',
      '--target',
      'https://target.example',
      '--max-pages',
      '400',
      '--target-max-pages',
      '900',
    ])

    expect(options.crawl.maxPages).toBe(400)
    expect(options.targetMaxPages).toBe(900)
  })

  it('replays a stored source crawl in place of crawling a source origin', () => {
    const options = parseArgs([
      '--source-crawl',
      'rehearsal/site-comparison.json',
      '--target',
      'https://target.example',
    ])

    expect(options.sourceCrawlPath).toBe('rehearsal/site-comparison.json')
    expect(options.source).toBeUndefined()
  })

  it('refuses a source origin and a stored crawl together', () => {
    expect(() =>
      parseArgs([
        '--source',
        'https://source.example',
        '--source-crawl',
        'rehearsal/site-comparison.json',
        '--target',
        'https://target.example',
      ]),
    ).toThrow('not both')
  })

  it('refuses source-crawl settings that a replay would silently ignore', () => {
    for (const [flag, value] of [
      ['--seed', '/about/'],
      ['--max-pages', '400'],
      ['--source-basic-auth-env', 'SOURCE_AUTH'],
    ]) {
      expect(() =>
        parseArgs([
          '--source-crawl',
          'rehearsal/site-comparison.json',
          '--target',
          'https://target.example',
          flag,
          value,
        ]),
      ).toThrow(`${flag} configures a source crawl`)
    }
  })

  it('still requires one kind of source', () => {
    expect(() => parseArgs(['--target', 'https://target.example'])).toThrow(
      '--source-crawl <file>',
    )
  })
})
