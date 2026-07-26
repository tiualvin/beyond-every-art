import type { ComparisonReport } from './types'

function printable(value: unknown): string {
  if (value === null) return '(missing)'
  if (Array.isArray(value)) return value.length ? value.join(', ') : '(none)'
  return String(value)
}

export function renderHumanReport(
  report: ComparisonReport,
  maxIssues = 50,
): string {
  const lines = [
    'Migration website comparison',
    `Source: ${report.sourceOrigin}`,
    `Target: ${report.targetOrigin}`,
    `Result: ${report.ok ? 'PASS' : 'FAIL'}`,
    `Pages: ${report.summary.comparedPages} compared (${report.summary.sourcePages} source, ${report.summary.targetPages} target)`,
    `Issues: ${report.summary.errors} errors, ${report.summary.warnings} warnings`,
  ]

  for (const issue of report.issues.slice(0, maxIssues)) {
    lines.push(
      `[${issue.severity.toUpperCase()}] ${issue.path} ${issue.code}: ${issue.message} (expected ${printable(issue.expected)}; actual ${printable(issue.actual)})`,
    )
  }
  if (report.issues.length > maxIssues) {
    lines.push(
      `... ${report.issues.length - maxIssues} more issues in JSON report`,
    )
  }
  return `${lines.join('\n')}\n`
}
