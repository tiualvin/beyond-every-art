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
})
