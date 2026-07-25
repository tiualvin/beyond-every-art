// CLI entry point for Stripe ↔ member reconciliation.
//
//   pnpm reconcile:billing --dry-run     read-only: compare and report
//   pnpm reconcile:billing               also record what Stripe currently says
//   pnpm reconcile:billing --report reconciliation-report.json
//
// Two jobs, both from docs/SUBSCRIPTION_WEBHOOKS.md:
//
// 1. **The pre-cutover backfill.** Before Ghost is switched off, list the
//    subscriptions Stripe is actually billing and match them to the migrated
//    members by `stripeCustomerID` / `stripeSubscriptionID`. Every difference
//    has to be explained *before* Ghost is cancelled, not after — skipping this
//    means renewals keep charging customers while our records stop reflecting
//    who is paying.
// 2. **The daily safety net.** Webhooks are an optimisation over polling, not a
//    guarantee: anything missed while the server was down or misbehaving shows
//    up here. Run it on a schedule and alert on a non-zero exit.
//
// Safe to rerun. A real run records one `billing-events` row per subscription,
// keyed on the subscription's observed status and period end, so a second run
// that sees unchanged state writes nothing. `--dry-run` never writes at all,
// but still reads both sides and produces the full report.
//
// The report contains Stripe identifiers and Payload member IDs only — no email
// addresses, names, or notes — so it is safe to paste into an issue. Report
// files are gitignored regardless.

import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Payload } from 'payload'

import {
  reconcile,
  reconciliationEventID,
  summarizeSubscription,
  type MemberBillingRecord,
  type StripeSubscriptionSummary,
} from '../lib/billing/reconcile'
import {
  isTestModeKey,
  listAccessGrantingSubscriptions,
  resolveStripeConfig,
} from '../lib/billing/stripe-api'
import type { StripeSubscription } from '../lib/billing/subscription-state'

interface Cli {
  dryRun: boolean
  reportPath: string
}

function flagValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag)
  return index >= 0 ? argv[index + 1] : undefined
}

function parseArgs(argv: string[]): Cli {
  return {
    dryRun: argv.includes('--dry-run'),
    reportPath: flagValue(argv, '--report') ?? 'reconciliation-report.json',
  }
}

interface MemberDoc {
  id: string | number
  status?: string | null
  stripeCustomerID?: string | null
  stripeSubscriptionID?: string | null
}

function toMemberRecord(doc: MemberDoc): MemberBillingRecord {
  return {
    id: doc.id,
    status: doc.status ?? null,
    stripeCustomerID: doc.stripeCustomerID || null,
    stripeSubscriptionID: doc.stripeSubscriptionID || null,
  }
}

async function main() {
  const cli = parseArgs(process.argv.slice(2))
  const stripeConfig = resolveStripeConfig(process.env)

  const [{ getPayload }, { default: config }] = await Promise.all([
    import('payload'),
    import('@payload-config'),
  ])
  const payload = await getPayload({ config })

  const subscriptions = await listAccessGrantingSubscriptions(stripeConfig)
  const summaries = subscriptions.map(summarizeSubscription)

  const members = await payload.find({
    collection: 'members',
    overrideAccess: true,
    depth: 0,
    pagination: false,
    limit: 0,
  })

  const result = reconcile(
    summaries,
    (members.docs as MemberDoc[]).map(toMemberRecord),
  )

  const report: Record<string, unknown> = {
    mode: cli.dryRun ? 'dry-run' : 'reconcile',
    stripeMode: isTestModeKey(stripeConfig) ? 'test' : 'live',
    time: new Date().toISOString(),
    ...result,
  }

  if (!cli.dryRun) {
    report.recorded = await recordObservations(
      payload,
      subscriptions,
      summaries,
      {
        livemode: !isTestModeKey(stripeConfig),
      },
    )
  }

  await writeFile(
    resolve(cli.reportPath),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)

  // Differences are the whole point of the check: exit non-zero so a cutover
  // step or a cron job fails loudly instead of scrolling past.
  if (!result.ok) process.exitCode = 1
}

/**
 * Record what Stripe says right now, one event per subscription.
 *
 * Until the `accounts` collection exists there is nothing to write a
 * subscription state onto, so the sweep persists its observations into the same
 * `billing-events` log the webhook writes to. Rerunning is a no-op while state
 * is unchanged, because the synthetic event ID includes the status and period
 * end.
 */
async function recordObservations(
  payload: Payload,
  subscriptions: StripeSubscription[],
  summaries: StripeSubscriptionSummary[],
  options: { livemode: boolean },
): Promise<{ written: number; unchanged: number; errors: string[] }> {
  const [{ applyObservation, recordBillingEvent }, { stateFromSubscription }] =
    await Promise.all([
      import('../lib/billing/store'),
      import('../lib/billing/subscription-state'),
    ])

  const byID = new Map(
    summaries.map((summary) => [summary.subscriptionID, summary]),
  )
  const observedAt = new Date().toISOString()
  let written = 0
  let unchanged = 0
  const errors: string[] = []

  for (const subscription of subscriptions) {
    const summary = byID.get(subscription.id)
    if (!summary) continue
    const eventID = reconciliationEventID(summary)

    try {
      const recorded = await recordBillingEvent(payload, {
        provider: 'stripe',
        eventID,
        type: 'reconciliation.snapshot',
        occurredAt: observedAt,
        livemode: options.livemode,
        source: 'reconciliation',
        rawEvent: subscription,
        subscriptionID: summary.subscriptionID,
        customerID: summary.customerID,
      })

      if (recorded.duplicate) {
        unchanged += 1
        continue
      }

      await applyObservation(
        payload,
        recorded.id,
        stateFromSubscription(subscription, { observedAt, eventID }),
      )
      written += 1
    } catch (error) {
      errors.push(
        `Failed to record ${subscription.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }

  if (errors.length > 0) process.exitCode = 1
  return { written, unchanged, errors }
}

main()
  .then(() => {
    // Payload holds an open Postgres pool, so the event loop never drains on
    // its own. Exit explicitly with the code set above, or a cron job would
    // hang after the report is written.
    process.exit(typeof process.exitCode === 'number' ? process.exitCode : 0)
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
