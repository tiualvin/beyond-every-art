import { describe, expect, it } from 'vitest'

import {
  buildMemberPlan,
  parseCsv,
  parseGhostMembersCsv,
} from '../../lib/migration/members'

describe('parseCsv', () => {
  it('splits simple rows', () => {
    expect(parseCsv('a,b,c\n1,2,3\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  it('handles quoted fields with embedded commas, newlines, and escaped quotes', () => {
    const csv = 'name,note\n"Ada, Editor","Loves ""pigments""\nand light"\n'
    expect(parseCsv(csv)).toEqual([
      ['name', 'note'],
      ['Ada, Editor', 'Loves "pigments"\nand light'],
    ])
  })

  it('handles a file with no trailing newline', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
})

describe('parseGhostMembersCsv', () => {
  it('maps rows to objects keyed by original header text', () => {
    const rows = parseGhostMembersCsv('email,name\nada@example.com,Ada\n')
    expect(rows).toEqual([{ email: 'ada@example.com', name: 'Ada' }])
  })

  it('returns an empty array for an empty file', () => {
    expect(parseGhostMembersCsv('')).toEqual([])
  })
})

describe('buildMemberPlan', () => {
  it('maps recognized headers, lowercases email, and preserves the raw row', () => {
    const rows = parseGhostMembersCsv(
      [
        'id,email,name,note,subscribed_to_emails,complimentary_plan,stripe_customer_id,created_at,labels',
        'member-1,Ada@Example.com,Ada Editor,VIP,true,false,cus_123,2023-01-01T00:00:00.000Z,"vip,founder"',
      ].join('\n'),
    )
    const { members: plan } = buildMemberPlan(rows)
    expect(plan).toEqual([
      {
        ghostID: 'member-1',
        data: {
          ghostID: 'member-1',
          email: 'ada@example.com',
          name: 'Ada Editor',
          note: 'VIP',
          status: 'paid',
          subscribed: true,
          comped: false,
          ghostCreatedAt: '2023-01-01T00:00:00.000Z',
          ghostUpdatedAt: undefined,
          labels: ['vip', 'founder'],
          stripeCustomerID: 'cus_123',
          stripeSubscriptionID: undefined,
          rawGhostData: rows[0],
        },
      },
    ])
  })

  it('falls back to email as ghostID when no id column is present', () => {
    const rows = parseGhostMembersCsv('email\nben@example.com\n')
    const { members } = buildMemberPlan(rows)
    expect(members[0].ghostID).toBe('ben@example.com')
  })

  it('derives comped status from complimentary_plan', () => {
    const rows = parseGhostMembersCsv(
      'email,complimentary_plan\ncomped@example.com,true\n',
    )
    expect(buildMemberPlan(rows).members[0].data.status).toBe('comped')
  })

  it('defaults to free when neither comped nor a Stripe customer is present', () => {
    const rows = parseGhostMembersCsv('email\nfree@example.com\n')
    expect(buildMemberPlan(rows).members[0].data.status).toBe('free')
  })

  it('skips rows missing an email and reports the row number', () => {
    const rows = parseGhostMembersCsv('email,name\n,No Email\n')
    const { members, skipped } = buildMemberPlan(rows)
    expect(members).toEqual([])
    expect(skipped).toEqual([{ row: 2, reason: 'missing email address' }])
  })
})
