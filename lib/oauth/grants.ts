// The lifecycle of a granted authorization, from consent to revocation.
//
// Every function here takes a Payload client and works through the Local API
// with `overrideAccess: true`, because these run *as* the authorization server
// rather than as a signed-in person: at the token endpoint there is no session
// at all, only a code or a refresh token, and the whole point is to resolve one
// into an identity. Access control still governs everything downstream — the
// object this returns is the capability record the MCP plugin already enforces.

import type { Payload } from 'payload'

import {
  ACCESS_TOKEN_TTL_MS,
  CODE_TTL_MS,
  REFRESH_TOKEN_TTL_MS,
  digestsMatch,
  hashToken,
  mintAccessToken,
  mintCode,
  mintRefreshToken,
} from './tokens'

// Payload's generated types are gitignored, so this file must compile both
// against them (locally, after `pnpm generate:types`) and without them (a clean
// checkout — the Docker build, and CI before anything boots Payload). Writes go
// through these aliases for that reason: the shape of `data` is only knowable
// in the first case, and a direct literal stops compiling in it the moment a
// relationship field is involved. Reads are widened through `unknown` for the
// same reason. Nothing here imports `payload-types`, and nothing should.
type CreateOptions = Parameters<Payload['create']>[0]
type UpdateOptions = Parameters<Payload['update']>[0]

/** A document read back, in the only shape both compilations agree on. */
type Doc = Record<string, unknown>

/** What a resolved access token yields: the capability record, and context. */
export type ResolvedGrant = {
  /** The `payload-mcp-api-keys` document, which is what the plugin consumes. */
  apiKey: Doc
  /** For the audit line, so a write traces back to the connector that made it. */
  clientName: string
  grantId: number | string
}

const now = () => Date.now()
const iso = (ms: number) => new Date(ms).toISOString()

/**
 * Resolves a presented access token to the capability record it stands for.
 *
 * Returns null for every failure — unknown, expired, revoked, or pointing at a
 * capability record that has since been deleted — so the caller has exactly one
 * branch to handle and cannot accidentally distinguish "wrong token" from
 * "expired token" in a response. That distinction is useful to an attacker
 * enumerating tokens and useless to a legitimate client, which re-authenticates
 * either way.
 *
 * Note the last check. Deleting an API-key document revokes any grant built on
 * it, with no cascade to write and nothing to remember: there is simply no
 * longer anything that says what the connector may do.
 */
export async function resolveAccessToken(
  payload: Payload,
  token: string,
): Promise<ResolvedGrant | null> {
  const { docs } = await payload.find({
    collection: 'oauth-grants',
    where: { accessTokenHash: { equals: hashToken(token, payload.secret) } },
    limit: 1,
    depth: 1,
    overrideAccess: true,
    pagination: false,
  })

  const grant = docs[0] as unknown as Doc | undefined
  if (!grant) return null
  if (grant.revoked === true) return null

  const expiresAt = grant.accessTokenExpiresAt
  if (typeof expiresAt !== 'string' || Date.parse(expiresAt) <= now()) {
    return null
  }

  const apiKeyRef = grant.apiKey
  const apiKeyId =
    typeof apiKeyRef === 'object' && apiKeyRef !== null
      ? (apiKeyRef as { id?: unknown }).id
      : apiKeyRef

  if (apiKeyId === undefined || apiKeyId === null) return null

  let apiKey: Doc
  try {
    apiKey = (await payload.findByID({
      collection: 'payload-mcp-api-keys',
      id: apiKeyId as number | string,
      depth: 1,
      overrideAccess: true,
    })) as unknown as Doc
  } catch {
    // Deleted out from under the grant. That is a revocation.
    return null
  }

  const client = grant.client
  const clientName =
    typeof client === 'object' && client !== null
      ? String((client as { clientName?: unknown }).clientName ?? 'unknown')
      : 'unknown'

  return { apiKey, clientName, grantId: grant.id as number | string }
}

/**
 * Records an approved consent and returns the authorization code to redirect
 * with.
 *
 * The code is returned in plaintext exactly once, here, and stored only as a
 * hash — so this return value is the only moment it exists in a readable form,
 * and it goes straight into a redirect.
 */
export async function createGrant(
  payload: Payload,
  input: {
    apiKeyId: number | string
    clientId: number | string
    clientName: string
    codeChallenge: string
    redirectUri: string
    userId: number | string
    userLabel: string
  },
): Promise<string> {
  const code = mintCode()

  await payload.create({
    collection: 'oauth-grants',
    data: {
      apiKey: input.apiKeyId,
      client: input.clientId,
      codeChallenge: input.codeChallenge,
      codeExpiresAt: iso(now() + CODE_TTL_MS),
      codeHash: hashToken(code, payload.secret),
      codeRedeemed: false,
      label: `${input.clientName} — ${input.userLabel}`,
      redirectUri: input.redirectUri,
      revoked: false,
      user: input.userId,
    },
    overrideAccess: true,
  } as unknown as CreateOptions)

  return code
}

export type TokenPair = {
  accessToken: string
  expiresIn: number
  refreshToken: string
}

/** Mints a fresh pair onto an existing grant, replacing whatever it held. */
async function issueTokens(
  payload: Payload,
  grantId: number | string,
  extra: Record<string, unknown> = {},
): Promise<TokenPair> {
  const accessToken = mintAccessToken()
  const refreshToken = mintRefreshToken()

  await payload.update({
    collection: 'oauth-grants',
    id: grantId,
    data: {
      accessTokenExpiresAt: iso(now() + ACCESS_TOKEN_TTL_MS),
      accessTokenHash: hashToken(accessToken, payload.secret),
      refreshTokenExpiresAt: iso(now() + REFRESH_TOKEN_TTL_MS),
      refreshTokenHash: hashToken(refreshToken, payload.secret),
      ...extra,
    },
    overrideAccess: true,
  } as unknown as UpdateOptions)

  return {
    accessToken,
    expiresIn: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    refreshToken,
  }
}

export type RedeemFailure = { error: string; description: string }

/**
 * Trades an authorization code for tokens.
 *
 * The checks are ordered so that the cheap, non-revealing ones happen first,
 * and every failure returns the same `invalid_grant` error code — a client that
 * sent the wrong verifier and a client that invented a code learn the same
 * thing.
 *
 * Redemption is single-use and enforced by a flag rather than by deleting the
 * row, because a *replayed* code is evidence: it means the code leaked from the
 * redirect, and the grant it belongs to is no longer trustworthy. So the second
 * attempt does not merely fail — it revokes the grant, taking with it any
 * tokens the first (possibly legitimate, possibly not) redemption produced.
 * That is the behaviour OAuth 2.1 asks for, and it fails in the direction of
 * disconnecting a real user rather than leaving a thief holding a token.
 */
export async function redeemCode(
  payload: Payload,
  input: {
    code: string
    codeVerifier: string
    redirectUri: string
    verifyPkce: (verifier: string, challenge: string) => boolean
  },
): Promise<RedeemFailure | TokenPair> {
  const invalid: RedeemFailure = {
    error: 'invalid_grant',
    description: 'The authorization code is invalid, expired, or already used.',
  }

  const { docs } = await payload.find({
    collection: 'oauth-grants',
    where: { codeHash: { equals: hashToken(input.code, payload.secret) } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    pagination: false,
  })

  const grant = docs[0] as unknown as Doc | undefined
  if (!grant) return invalid

  if (grant.codeRedeemed === true || grant.revoked === true) {
    // Replay. Burn the grant rather than merely refusing this attempt.
    await payload.update({
      collection: 'oauth-grants',
      id: grant.id as number | string,
      data: {
        accessTokenHash: null,
        refreshTokenHash: null,
        revoked: true,
      },
      overrideAccess: true,
    } as unknown as UpdateOptions)
    return invalid
  }

  const expiresAt = grant.codeExpiresAt
  if (typeof expiresAt !== 'string' || Date.parse(expiresAt) <= now()) {
    return invalid
  }

  // The redirect URI is checked again here, against the one the code was issued
  // for. RFC 6749 §4.1.3: without it, a client that registered two URIs could
  // start a flow at one and redeem at the other.
  if (grant.redirectUri !== input.redirectUri) return invalid

  const challenge = grant.codeChallenge
  if (
    typeof challenge !== 'string' ||
    !input.verifyPkce(input.codeVerifier, challenge)
  ) {
    return invalid
  }

  return issueTokens(payload, grant.id as number | string, {
    codeHash: null,
    codeRedeemed: true,
  })
}

/**
 * Exchanges a refresh token for a new pair, rotating both.
 *
 * Rotation means the presented refresh token stops working the moment a new one
 * is issued, which turns a stolen refresh token into a detectable event: either
 * the thief uses it first and the real client's next refresh fails, or the real
 * client uses it first and the thief's fails. Either way one of them presents a
 * token this grant no longer holds, and that is what the replay branch below is
 * for — it revokes rather than merely refusing, because at that point the two
 * parties cannot be told apart and only one of them should keep access.
 */
export async function refreshGrant(
  payload: Payload,
  refreshToken: string,
): Promise<RedeemFailure | TokenPair> {
  const invalid: RedeemFailure = {
    error: 'invalid_grant',
    description: 'The refresh token is invalid, expired, or has been revoked.',
  }

  const presented = hashToken(refreshToken, payload.secret)
  const { docs } = await payload.find({
    collection: 'oauth-grants',
    where: { refreshTokenHash: { equals: presented } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    pagination: false,
  })

  const grant = docs[0] as unknown as Doc | undefined
  if (!grant) return invalid
  if (grant.revoked === true) return invalid

  const stored = grant.refreshTokenHash
  if (typeof stored !== 'string' || !digestsMatch(stored, presented)) {
    return invalid
  }

  const expiresAt = grant.refreshTokenExpiresAt
  if (typeof expiresAt !== 'string' || Date.parse(expiresAt) <= now()) {
    return invalid
  }

  return issueTokens(payload, grant.id as number | string)
}

/**
 * Revocation, per RFC 7009.
 *
 * Takes either kind of token and kills the whole grant, not just the token
 * presented: a caller asking to revoke is asking for access to stop, and
 * leaving a live refresh token behind because they happened to name the access
 * token would be a surprising reading of that.
 *
 * Always resolves. RFC 7009 §2.2 requires the endpoint to answer 200 for an
 * unrecognised token, so that revocation cannot be used to probe which tokens
 * exist.
 */
export async function revokeByToken(
  payload: Payload,
  token: string,
): Promise<void> {
  const hash = hashToken(token, payload.secret)
  const { docs } = await payload.find({
    collection: 'oauth-grants',
    where: {
      or: [
        { accessTokenHash: { equals: hash } },
        { refreshTokenHash: { equals: hash } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    pagination: false,
  })

  const grant = docs[0] as unknown as Doc | undefined
  if (!grant) return

  await payload.update({
    collection: 'oauth-grants',
    id: grant.id as number | string,
    data: { accessTokenHash: null, refreshTokenHash: null, revoked: true },
    overrideAccess: true,
  } as unknown as UpdateOptions)
}
