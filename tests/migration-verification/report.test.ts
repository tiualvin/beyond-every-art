import { describe, expect, it } from 'vitest'

import { renderHumanReport } from '../../lib/migration-verification/report'
import type { ComparisonReport } from '../../lib/migration-verification/types'

describe('renderHumanReport', () => {
  it('renders a concise summary and caps inline findings', () => {
    const report = {
      ok: false,
      sourceOrigin: 'https://source.example',
      targetOrigin: 'https://target.example',
      summary: {
        sourcePages: 1,
        targetPages: 1,
        comparedPages: 1,
        errors: 2,
        warnings: 0,
        sourceLimitReached: false,
        targetLimitReached: false,
      },
      issues: [
        {
          severity: 'error',
          code: 'first',
          path: '/',
          field: 'title',
          expected: 'Old',
          actual: 'New',
          message: 'First issue',
        },
        {
          severity: 'error',
          code: 'second',
          path: '/',
          field: 'status',
          expected: 200,
          actual: 404,
          message: 'Second issue',
        },
      ],
      source: {} as ComparisonReport['source'],
      target: {} as ComparisonReport['target'],
    } satisfies ComparisonReport

    expect(renderHumanReport(report, 1)).toContain('Result: FAIL')
    expect(renderHumanReport(report, 1)).toContain('2 errors, 0 warnings')
    expect(renderHumanReport(report, 1)).toContain('... 1 more issues')
    expect(renderHumanReport(report, 1)).not.toContain('Second issue')
  })
})
