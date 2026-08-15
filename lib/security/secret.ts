// Refusing to run in production on a secret that is published in this
// repository.
//
// `PAYLOAD_SECRET` signs session cookies and password-reset tokens. Anyone who
// knows it can mint a session for any user, so a known value is not a weak
// secret — it is no authentication at all.
//
// This is not hypothetical here. `docs/DEPLOYMENT_STATUS.md` records that the
// production stack ran for weeks on `development-only-change-me`, because
// `docker-compose.yml` supplied it as a default and nothing anywhere said so:
// the containers were healthy, the site served, and the only symptom was a
// value in a file that anyone could read. A default that silently substitutes
// for a missing secret converts a configuration mistake into a silent one, and
// the fix is to make the mistake loud.
//
// The defaults are gone from `docker-compose.yml`; this is the second half,
// because an empty variable would otherwise be just as quiet as a wrong one.

type Env = Record<string, string | undefined>

/**
 * Values that must never reach production, matched case-insensitively.
 *
 * Both are real strings from this repository — the Compose default that was
 * actually deployed, and the placeholder in `.env.example` that someone
 * copying the file to `.env` would inherit verbatim.
 */
export const PUBLISHED_PLACEHOLDER_SECRETS = [
  'development-only-change-me',
  'replace-with-a-long-random-development-secret',
  'synthetic-ci-secret-that-is-not-used-in-production',
]

export class InsecurePayloadSecret extends Error {
  constructor(reason: string) {
    super(
      `Refusing to start: PAYLOAD_SECRET ${reason}. It signs session cookies ` +
        'and password-reset tokens, so a missing or published value means ' +
        'anyone can forge an administrator session. Generate one with ' +
        '`openssl rand -hex 32` and set it in the production environment ' +
        'file. See docs/DEPLOYMENT_STATUS.md.',
    )
    this.name = 'InsecurePayloadSecret'
  }
}

export interface SecretCheckOptions {
  env?: Env
}

/**
 * Whether this process is serving traffic, as opposed to building an image.
 *
 * `next build` runs with `NODE_ENV=production` and sets `NEXT_PHASE`, and the
 * Dockerfile's builder stage has no secrets — correctly, since a build must not
 * bake one in. Checking `NODE_ENV` alone would therefore fail every image
 * build, so the phase is what separates "about to serve requests" from
 * "compiling".
 */
export function isServingProduction(env: Env): boolean {
  if (env.NEXT_PHASE === 'phase-production-build') return false
  return env.NODE_ENV === 'production'
}

/**
 * The secret to hand Payload, or a thrown error explaining what to fix.
 *
 * Outside production this returns whatever is set, including nothing: local
 * development and CI both need to boot without ceremony, and neither is
 * protecting anything. No minimum length is imposed — the failure being
 * guarded against is a *known* value, and a length rule risks refusing to start
 * on a real secret that happens to be short, which would turn this check into
 * the outage it exists to prevent.
 */
export function resolvePayloadSecret(options: SecretCheckOptions = {}): string {
  const env = options.env ?? process.env
  const secret = (env.PAYLOAD_SECRET ?? '').trim()

  if (!isServingProduction(env)) return secret

  if (!secret) throw new InsecurePayloadSecret('is not set')

  if (
    PUBLISHED_PLACEHOLDER_SECRETS.some(
      (placeholder) => placeholder.toLowerCase() === secret.toLowerCase(),
    )
  ) {
    throw new InsecurePayloadSecret(
      'is a placeholder value published in this repository',
    )
  }

  return secret
}
