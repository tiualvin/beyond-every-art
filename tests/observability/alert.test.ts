import { describe, expect, it, vi } from 'vitest'

import {
  ThresholdAlarm,
  alertsEnabled,
  sendAlert,
} from '../../lib/observability/alert'

describe('alertsEnabled', () => {
  // Default off, so no deployment gains an outbound request it did not ask for.
  it.each([{}, { ALERT_WEBHOOK_URL: '' }, { ALERT_WEBHOOK_URL: '   ' }])(
    'is off for %j',
    (env) => {
      expect(alertsEnabled(env as unknown as NodeJS.ProcessEnv)).toBe(false)
    },
  )

  it('is on once a destination is configured', () => {
    expect(
      alertsEnabled({
        ALERT_WEBHOOK_URL: 'https://hooks.example/x',
      } as unknown as NodeJS.ProcessEnv),
    ).toBe(true)
  })
})

describe('ThresholdAlarm', () => {
  it('stays quiet below the threshold', () => {
    const alarm = new ThresholdAlarm(3, 60_000)
    expect(alarm.record('ip:1.2.3.4', 0)).toBe(false)
    expect(alarm.record('ip:1.2.3.4', 1)).toBe(false)
  })

  it('fires on the event that crosses it', () => {
    const alarm = new ThresholdAlarm(3, 60_000)
    alarm.record('ip:1.2.3.4', 0)
    alarm.record('ip:1.2.3.4', 1)
    expect(alarm.record('ip:1.2.3.4', 2)).toBe(true)
  })

  // An alarm that repeats is an alarm that gets muted, so the hundredth failure
  // of a run must not be a hundredth message.
  it('fires once, then holds its peace for the cooldown', () => {
    const alarm = new ThresholdAlarm(2, 60_000, 10 * 60_000)
    alarm.record('ip:1.2.3.4', 0)
    expect(alarm.record('ip:1.2.3.4', 1)).toBe(true)

    for (let i = 0; i < 50; i += 1) {
      expect(alarm.record('ip:1.2.3.4', 2 + i)).toBe(false)
    }
  })

  it('fires again once the cooldown has passed', () => {
    const alarm = new ThresholdAlarm(2, 60_000, 10 * 60_000)
    alarm.record('ip:1.2.3.4', 0)
    expect(alarm.record('ip:1.2.3.4', 1)).toBe(true)

    const later = 11 * 60_000
    alarm.record('ip:1.2.3.4', later)
    expect(alarm.record('ip:1.2.3.4', later + 1)).toBe(true)
  })

  it('counts each source separately, so one noisy address does not mask another', () => {
    const alarm = new ThresholdAlarm(2, 60_000)
    alarm.record('ip:1.1.1.1', 0)
    expect(alarm.record('ip:2.2.2.2', 1)).toBe(false)
    expect(alarm.record('ip:1.1.1.1', 2)).toBe(true)
  })

  it('forgets events that fall outside the window', () => {
    const alarm = new ThresholdAlarm(3, 60_000)
    alarm.record('ip:1.2.3.4', 0)
    alarm.record('ip:1.2.3.4', 1)
    // Two failures an hour apart are not a run.
    expect(alarm.record('ip:1.2.3.4', 60_001)).toBe(false)
  })
})

describe('sendAlert', () => {
  const body = {
    event: 'mcp_auth_failures',
    message: 'test',
    source: 'ip:1.2.3.4',
    time: '2026-01-01T00:00:00.000Z',
  }

  it('posts nothing when no destination is configured', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await sendAlert(body, {} as unknown as NodeJS.ProcessEnv)
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('posts a JSON body carrying a renderable `text` field', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }))

    await sendAlert(body, {
      ALERT_WEBHOOK_URL: 'https://hooks.example/x',
    } as unknown as NodeJS.ProcessEnv)

    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://hooks.example/x')
    const sent = JSON.parse(String((init as RequestInit).body))
    expect(sent.text).toContain('test')
    expect(sent.event).toBe('mcp_auth_failures')
    fetchSpy.mockRestore()
  })

  // An unreachable alert destination must not turn a refused request into a
  // failed one — the whole call site is a `void`, and this is why it can be.
  it('swallows a failure from the destination', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('unreachable'))

    await expect(
      sendAlert(body, {
        ALERT_WEBHOOK_URL: 'https://hooks.example/x',
      } as unknown as NodeJS.ProcessEnv),
    ).resolves.toBeUndefined()

    fetchSpy.mockRestore()
  })
})
