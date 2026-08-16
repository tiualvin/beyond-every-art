// Next.js instrumentation. `onRequestError` fires for uncaught server-side
// errors (500s), which we emit as a single structured JSON line so a log
// collector or uptime monitor can alert on request failures in production.
// `register` runs once at server start and checks the deployment for
// configuration that must not reach production.

import { csrfProtectionIsUnconfigured } from '@/lib/security/origins'
import { resolvePayloadSecret } from '@/lib/security/secret'

/**
 * Startup configuration check.
 *
 * This used to warn and carry on, on the reasoning that refusing to boot would
 * take the site down over something an operator could fix in a file. That
 * reasoning did not survive contact with what happened: the warning was in
 * place for the entire period the production stack ran on the compose
 * placeholder (docs/DEPLOYMENT_STATUS.md), and nobody saw it. A control that
 * has already failed once in exactly the situation it exists for is not a
 * control, and serving with forgeable admin sessions is worse than being down
 * with a message saying why.
 *
 * So it is fatal now, and `lib/security/secret.ts` is the single place that
 * decides — the same function Payload's own config calls. Running it here as
 * well only moves the failure earlier, to boot rather than to whichever request
 * first touches Payload.
 *
 * Measured, not assumed: Next catches what this throws and the process still
 * listens, so the container does not exit. What it cannot do is serve — every
 * Payload-backed route answers 500, `/health` among them, so the Compose
 * healthcheck fails, `docker compose up --wait` fails, and the deploy stops
 * with the reason in `docker compose logs app`. Nothing authenticates in that
 * state, which is the property that matters.
 */
export async function register(): Promise<void> {
  // Next registers instrumentation once per runtime; the Node server is the
  // one that holds the environment, and checking once keeps the failure single.
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== 'nodejs') return
  resolvePayloadSecret()

  // Warned about rather than refused, because an unconfigured allowlist is the
  // state that has been serving traffic all along — see
  // `csrfProtectionIsUnconfigured`. What it costs is Payload's cross-origin
  // check on session cookies, and a working link in a password-reset email.
  if (csrfProtectionIsUnconfigured()) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: 'csrf_origins_unconfigured',
        time: new Date().toISOString(),
        message:
          'No public origin is configured, so Payload accepts a session ' +
          'cookie from any origin and cannot build an absolute password-reset ' +
          'link. Set CMS_ADDRESS (and NEXT_PUBLIC_SITE_URL) in the production ' +
          'environment file. See lib/security/origins.ts.',
      }),
    )
  }
}

export async function onRequestError(
  error: unknown,
  request: { path?: string; method?: string },
): Promise<void> {
  const entry = {
    level: 'error',
    event: 'request_error',
    time: new Date().toISOString(),
    method: request.method ?? null,
    path: request.path ?? null,
    message: error instanceof Error ? error.message : String(error),
  }
  console.error(JSON.stringify(entry))
}
