// Next.js instrumentation. `onRequestError` fires for uncaught server-side
// errors (500s), which we emit as a single structured JSON line so a log
// collector or uptime monitor can alert on request failures in production.
// `register` runs once at server start and checks the deployment for
// configuration that must not reach production.

// docker-compose.yml falls back to this value so `docker compose config` works
// without an .env file; a real deployment must override it.
const PLACEHOLDER_SECRET = 'development-only-change-me'

/**
 * Startup configuration check. PAYLOAD_SECRET signs admin sessions and reset
 * tokens, so booting production with the compose placeholder (or none at all)
 * means anyone who knows the default can mint a valid session. Loud rather
 * than fatal: refusing to boot would take the site down for a problem an
 * operator can fix in the environment file.
 */
export async function register(): Promise<void> {
  const secret = process.env.PAYLOAD_SECRET
  if (process.env.NODE_ENV !== 'production') return
  // Next registers instrumentation once per runtime; report from the Node
  // server only so the warning appears a single time per boot.
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== 'nodejs') return
  if (secret && secret !== PLACEHOLDER_SECRET) return

  console.error(
    JSON.stringify({
      level: 'error',
      event: 'insecure_config',
      time: new Date().toISOString(),
      setting: 'PAYLOAD_SECRET',
      message: secret
        ? 'PAYLOAD_SECRET is still the shared placeholder value; set a unique secret before serving production traffic.'
        : 'PAYLOAD_SECRET is not set; admin sessions and password-reset tokens are not securely signed.',
    }),
  )
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
