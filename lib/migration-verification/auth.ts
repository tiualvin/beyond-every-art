/**
 * Resolve a Basic auth header from an environment variable name. The caller
 * must keep the returned header in memory and never add it to report data.
 */
export function basicAuthorizationFromEnvironment(
  environmentName: string | undefined,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string | undefined {
  if (!environmentName) return undefined
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(environmentName)) {
    throw new Error('Basic auth environment variable name is invalid')
  }
  const credential = environment[environmentName]
  if (!credential) {
    throw new Error(
      `Basic auth environment variable is not set: ${environmentName}`,
    )
  }
  if (!credential.includes(':') || /[\r\n]/.test(credential)) {
    throw new Error(
      `Basic auth environment variable must contain user:password: ${environmentName}`,
    )
  }
  return `Basic ${Buffer.from(credential, 'utf8').toString('base64')}`
}
