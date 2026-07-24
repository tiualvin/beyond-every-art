// Pure parser + mapper for Ghost's redirects export (redirects.json).
//
// Ghost stores redirects as a flat JSON array of `{ from, to, permanent }`
// rules (the same data is also mirrored into a `redirects.yaml` grouped by
// status code, but the JSON form is simpler to parse reliably). The Redirects
// collection instead stores one row per rule with an explicit status code,
// since Payload's schema field needs a concrete value rather than Ghost's
// boolean permanent/temporary split.

export interface GhostRedirectRule {
  from: string
  to: string
  permanent?: boolean
}

export type RedirectStatusCode = '301' | '302' | '307' | '308'

export interface RedirectPlan {
  source: string
  destination: string
  statusCode: RedirectStatusCode
}

export function parseGhostRedirects(value: unknown): GhostRedirectRule[] {
  if (!Array.isArray(value)) {
    throw new Error('Invalid Ghost redirects export: expected a JSON array')
  }
  return value.filter(isGhostRedirectRule)
}

function isGhostRedirectRule(value: unknown): value is GhostRedirectRule {
  if (!value || typeof value !== 'object') return false
  const rule = value as Record<string, unknown>
  return typeof rule.from === 'string' && typeof rule.to === 'string'
}

/** Build the redirect import plan, deduplicating on `source`. */
export function buildRedirectPlan(rules: GhostRedirectRule[]): RedirectPlan[] {
  const seen = new Set<string>()
  const plan: RedirectPlan[] = []
  for (const rule of rules) {
    // The Redirects collection enforces a unique `source`; first rule wins
    // for a given path, matching how a router would apply an ordered list.
    if (seen.has(rule.from)) continue
    seen.add(rule.from)
    plan.push({
      source: rule.from,
      destination: rule.to,
      statusCode: rule.permanent === false ? '302' : '301',
    })
  }
  return plan
}
