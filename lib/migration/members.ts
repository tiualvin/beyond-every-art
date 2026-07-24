// Pure parser + mapper for Ghost's members export (a CSV downloaded from
// Members -> Settings -> Export all members).
//
// Ghost's portable member CSV does not include the member's internal Ghost
// id (unlike the content JSON export, which does). Email is the only field
// guaranteed present and unique, so it doubles as the idempotency key when no
// id column is available; the Members collection's required `ghostID` field
// falls back to the email address in that case. Column names vary slightly
// across Ghost versions, so headers are matched case-insensitively against a
// small alias table rather than a fixed position.

export type MemberStatus = 'free' | 'paid' | 'comped'

export interface MemberPlan {
  ghostID: string
  data: {
    ghostID: string
    email: string
    name?: string
    note?: string
    status: MemberStatus
    subscribed: boolean
    comped: boolean
    ghostCreatedAt?: string
    ghostUpdatedAt?: string
    labels?: string[]
    stripeCustomerID?: string
    stripeSubscriptionID?: string
    rawGhostData: Record<string, string>
  }
}

export interface MemberImportPlan {
  members: MemberPlan[]
  // Rows dropped for lacking an email address (Payload requires one).
  skipped: Array<{ row: number; reason: string }>
}

const HEADER_ALIASES: Record<string, string> = {
  id: 'id',
  member_id: 'id',
  email: 'email',
  'email address': 'email',
  name: 'name',
  note: 'note',
  notes: 'note',
  subscribed_to_emails: 'subscribed',
  subscribed: 'subscribed',
  complimentary_plan: 'comped',
  comped: 'comped',
  status: 'status',
  stripe_customer_id: 'stripeCustomerID',
  stripe_subscription_id: 'stripeSubscriptionID',
  created_at: 'createdAt',
  'created date': 'createdAt',
  updated_at: 'updatedAt',
  labels: 'labels',
  email_count: 'emailCount',
  email_opened_count: 'emailOpenedCount',
  email_open_rate: 'emailOpenRate',
  last_seen_at: 'lastSeenAt',
}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase()
}

/** Minimal RFC 4180 CSV parser: quoted fields, embedded commas/newlines, "" escaping. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const normalized = text.replace(/\r\n/g, '\n')

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i]
    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }
    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((cells) => !(cells.length === 1 && cells[0] === ''))
}

/** Parse a Ghost members CSV export into raw rows keyed by original header text. */
export function parseGhostMembersCsv(
  csvText: string,
): Array<Record<string, string>> {
  const rows = parseCsv(csvText)
  if (rows.length === 0) return []
  const headers = rows[0]
  return rows.slice(1).map((cells) => {
    const raw: Record<string, string> = {}
    headers.forEach((header, index) => {
      raw[header.trim()] = cells[index] ?? ''
    })
    return raw
  })
}

function toBool(value: string | undefined): boolean {
  if (!value) return false
  return ['true', '1', 'yes', 'y'].includes(value.trim().toLowerCase())
}

function toStatus(
  explicit: string | undefined,
  comped: boolean,
  hasStripeCustomer: boolean,
): MemberStatus {
  const normalized = explicit?.trim().toLowerCase()
  if (
    normalized === 'free' ||
    normalized === 'paid' ||
    normalized === 'comped'
  ) {
    return normalized
  }
  if (comped) return 'comped'
  if (hasStripeCustomer) return 'paid'
  return 'free'
}

function undef(value: string | undefined): string | undefined {
  return value && value.trim().length > 0 ? value : undefined
}

/** Map a raw CSV row (keyed by original header) to its aliased field values. */
function aliasRow(raw: Record<string, string>): Record<string, string> {
  const mapped: Record<string, string> = {}
  for (const [header, value] of Object.entries(raw)) {
    const alias = HEADER_ALIASES[normalizeHeader(header)]
    if (alias) mapped[alias] = value
  }
  return mapped
}

/** Build the member import plan from parsed CSV rows. */
export function buildMemberPlan(
  rows: Array<Record<string, string>>,
): MemberImportPlan {
  const members: MemberPlan[] = []
  const skipped: Array<{ row: number; reason: string }> = []

  rows.forEach((raw, index) => {
    const mapped = aliasRow(raw)
    const email = undef(mapped.email)?.toLowerCase()
    if (!email) {
      skipped.push({ row: index + 2, reason: 'missing email address' })
      return
    }

    const comped = toBool(mapped.comped)
    const stripeCustomerID = undef(mapped.stripeCustomerID)
    const labels = undef(mapped.labels)
      ?.split(',')
      .map((label) => label.trim())
      .filter(Boolean)

    members.push({
      ghostID: undef(mapped.id) ?? email,
      data: {
        ghostID: undef(mapped.id) ?? email,
        email,
        name: undef(mapped.name),
        note: undef(mapped.note),
        status: toStatus(mapped.status, comped, Boolean(stripeCustomerID)),
        subscribed: toBool(mapped.subscribed),
        comped,
        ghostCreatedAt: undef(mapped.createdAt),
        ghostUpdatedAt: undef(mapped.updatedAt),
        labels: labels && labels.length > 0 ? labels : undefined,
        stripeCustomerID,
        stripeSubscriptionID: undef(mapped.stripeSubscriptionID),
        rawGhostData: raw,
      },
    })
  })

  return { members, skipped }
}
