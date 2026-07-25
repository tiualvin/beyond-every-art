// Next.js instrumentation. `onRequestError` fires for uncaught server-side
// errors (500s), which we emit as a single structured JSON line so a log
// collector or uptime monitor can alert on request failures in production.

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
