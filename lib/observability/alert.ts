// Getting one class of log line in front of a person.
//
// The MCP endpoint already writes `mcp_refused` with `reason: "unauthorized"`
// every time somebody presents a key it does not recognise. On a publicly
// reachable write endpoint whose only credential is a bearer token, a run of
// those lines is the single most important thing the deployment can tell you —
// and until now the only way it reached anybody was
// `docker compose logs app | grep mcp_`, typed by someone who already suspected
// something. The evidence existed and the alarm did not.
//
// This is deliberately small. It is not a monitoring system: it posts a JSON
// body to a URL when a counter crosses a threshold, and says nothing otherwise.
// Unset `ALERT_WEBHOOK_URL` and it does nothing at all, which is the default —
// so no deployment gains an outbound request it did not ask for.
//
// Two properties matter more than the feature itself:
//
//   - **It never throws and never blocks.** An alert failing must not fail the
//     request that triggered it, and must not add its latency either. The post
//     is fired and forgotten.
//   - **It carries no credential.** The refusal line already truncates the
//     presented key to its last characters; nothing here widens that. An alert
//     body ends up in a chat room, and a chat room is not a secret store.

import { clientKey } from '../security/rate-limit'

/** Alerts are off unless a destination is configured. */
export const alertsEnabled = (env = process.env): boolean =>
  Boolean(env.ALERT_WEBHOOK_URL?.trim())

/** How long an alert of a given kind stays quiet after firing. */
const DEFAULT_COOLDOWN_MS = 15 * 60_000

/** Longest a post is given before it is abandoned. */
const TIMEOUT_MS = 5_000

type Counter = { count: number; resetAt: number }

/**
 * Counts events per key over a window, and reports when a threshold is crossed.
 *
 * Separate from `FixedWindowRateLimiter` despite the resemblance, because the
 * question is different: a limiter decides whether to *serve* a request and
 * must be cheap and exact, while this decides whether to *tell somebody* and
 * must not tell them sixty times. Sharing the class would have meant one of the
 * two behaving oddly for the other's sake.
 */
export class ThresholdAlarm {
  private readonly counters = new Map<string, Counter>()
  private readonly silenced = new Map<string, number>()

  constructor(
    private readonly threshold: number,
    private readonly windowMs: number,
    private readonly cooldownMs: number = DEFAULT_COOLDOWN_MS,
  ) {}

  /**
   * Records one event and returns true when this is the one that should fire.
   *
   * True at most once per cooldown per key: the hundredth failure of a run is
   * not news, and an alarm that repeats is an alarm that gets muted.
   */
  record(key: string, now: number = Date.now()): boolean {
    const quietUntil = this.silenced.get(key)
    if (quietUntil !== undefined && quietUntil > now) {
      // Still counting — the window keeps advancing so the next post carries a
      // truthful number — but not firing.
      this.bump(key, now)
      return false
    }

    const count = this.bump(key, now)
    if (count < this.threshold) return false

    this.silenced.set(key, now + this.cooldownMs)
    this.counters.delete(key)
    return true
  }

  /** How many events the current window holds, for the alert body. */
  count(key: string): number {
    return this.counters.get(key)?.count ?? 0
  }

  private bump(key: string, now: number): number {
    // Swept opportunistically: the map only grows while events are arriving,
    // and an expired entry is rewritten rather than accumulated.
    for (const [existing, counter] of this.counters) {
      if (counter.resetAt <= now) this.counters.delete(existing)
    }

    const current = this.counters.get(key)
    if (!current || current.resetAt <= now) {
      this.counters.set(key, { count: 1, resetAt: now + this.windowMs })
      return 1
    }

    current.count += 1
    return current.count
  }
}

export type AlertBody = {
  event: string
  message: string
  source: string
  time: string
}

/**
 * Posts an alert, or does nothing.
 *
 * Not awaited by callers on purpose — see the note at the top of the file. The
 * promise is returned so a test can await it.
 */
export async function sendAlert(
  body: AlertBody,
  env = process.env,
): Promise<void> {
  const destination = env.ALERT_WEBHOOK_URL?.trim()
  if (!destination) return

  try {
    await fetch(destination, {
      body: JSON.stringify({
        // Named `text` as well, because the common destinations for this — a
        // Slack or Discord incoming webhook — render that field and ignore the
        // rest. Costs nothing and makes the alert readable without a formatter.
        text: `[beyond-every-art] ${body.message}`,
        ...body,
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    // Best effort, always. An unreachable alert destination must not turn a
    // refused request into a failed one.
  }
}

/**
 * The alarm for unrecognised MCP keys.
 *
 * Ten failures from one address inside five minutes is well past a
 * misconfigured client, which fails the same way twice and then stops, and well
 * short of anything a person does by hand. The rate limiter already refuses at
 * ten in fifteen minutes; this fires on the way to that ceiling so the refusal
 * and the notice arrive together rather than the refusal arriving alone.
 */
export const mcpAuthAlarm = new ThresholdAlarm(10, 5 * 60_000)

/** Records one failed MCP authentication, alerting if a run is under way. */
export function recordMcpAuthFailure(headers: Headers): void {
  if (!alertsEnabled()) return

  const source = clientKey(headers)
  if (!mcpAuthAlarm.record(source)) return

  void sendAlert({
    event: 'mcp_auth_failures',
    message:
      `Repeated MCP authentication failures from ${source}. ` +
      'Somebody is presenting keys this deployment does not recognise.',
    source,
    time: new Date().toISOString(),
  })
}
