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
  GRANT_ABSOLUTE_TTL_MS,
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

  // Checked here too, not only at refresh: an access token minted in the last
  // hour before the ceiling would otherwise keep working past it.
  const absolute = grant.absoluteExpiresAt
  if (typeof absolute === 'string' && Date.parse(absolute) <= now()) return null

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
      absoluteExpiresAt: iso(now() + GRANT_ABSOLUTE_TTL_MS),
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

/**
 * Mints a fresh pair onto an existing grant, replacing whatever it held.
 *
 * `supersedes` is the refresh-token hash being rotated away from, and storing it
 * is what makes replay detectable at all — see `refreshGrant`. It is null on the
 * first issuance, where there is nothing to supersede.
 */
async function issueTokens(
  payload: Payload,
  grantId: number | string,
  supersedes: string | null,
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
      previousRefreshTokenHash: supersedes,
      // Deliberately not extended: `absoluteExpiresAt` is set once, at consent.
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
 * Kills a grant and everything issued under it.
 *
 * Reached from both replay paths. A replayed code or refresh token means the
 * secret reached somebody it should not have, and at that point the legitimate
 * client and the thief are indistinguishable — so access stops for both rather
 * than continuing for whichever one asks next.
 */
async function burnGrant(
  payload: Payload,
  grantId: number | string,
): Promise<void> {
  await payload.update({
    collection: 'oauth-grants',
    id: grantId,
    data: {
      accessTokenHash: null,
      previousRefreshTokenHash: null,
      refreshTokenHash: null,
      revoked: true,
    },
    overrideAccess: true,
  } as unknown as UpdateOptions)
}

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
    await burnGrant(payload, grant.id as number | string)
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

  // `codeHash` is deliberately *kept*. Nulling it on success looked tidy and
  // quietly disabled the branch above: a replayed code would hash to a value no
  // row held, so the lookup missed, the grant was never burned, and the
  // single-use rule degraded from "burn on reuse" to "politely decline".
  // `codeRedeemed` is what enforces single use; the hash is what lets a second
  // attempt be recognised as a replay of *this* grant.
  return issueTokens(payload, grant.id as number | string, null, {
    codeRedeemed: true,
  })
}

/**
 * Exchanges a refresh token for a new pair, rotating both, and detects replay.
 *
 * Rotation means the presented token stops working the moment a new one is
 * issued. On its own that only *refuses* the old token, which is not much: a
 * thief and the legitimate client both keep trying, one of them succeeds each
 * time, and nothing anywhere records that a secret leaked.
 *
 * What makes it a control is remembering one generation back. The lookup below
 * matches either the current hash or the superseded one, so presenting a
 * rotated-away token is distinguishable from presenting a token that never
 * existed — and the first case is the signature of a stolen credential. It
 * cannot be told apart from a client that lost the rotation to a dropped
 * response, and that ambiguity is precisely why the grant is burned rather than
 * merely refused: one of the two parties should not keep access, and there is
 * no way to know which.
 *
 * This is the half that was documented and missing. Without the superseded hash
 * the replayed token matched no row at all, the function returned `invalid`, and
 * the grant carried on serving the thief indefinitely.
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
    where: {
      or: [
        { refreshTokenHash: { equals: presented } },
        { previousRefreshTokenHash: { equals: presented } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    pagination: false,
  })

  const grant = docs[0] as unknown as Doc | undefined
  if (!grant) return invalid
  if (grant.revoked === true) return invalid

  const grantId = grant.id as number | string
  const current = grant.refreshTokenHash
  const previous = grant.previousRefreshTokenHash

  // Replay. The row was found on the superseded hash, so this token was already
  // rotated away from — somebody is presenting a spent secret.
  if (typeof previous === 'string' && digestsMatch(previous, presented)) {
    await burnGrant(payload, grantId)
    return invalid
  }

  // Belt and braces: the lookup matched one of two columns, so reaching here
  // means it was the current one. Checked rather than assumed, because a future
  // change to the query above should fail closed instead of silently accepting.
  if (typeof current !== 'string' || !digestsMatch(current, presented)) {
    return invalid
  }

  const expiresAt = grant.refreshTokenExpiresAt
  if (typeof expiresAt !== 'string' || Date.parse(expiresAt) <= now()) {
    return invalid
  }

  // The ceiling rotation cannot push. A grant past it is finished however fresh
  // its refresh token is; the connector has to be approved again.
  const absolute = grant.absoluteExpiresAt
  if (typeof absolute === 'string' && Date.parse(absolute) <= now()) {
    return {
      error: 'invalid_grant',
      description:
        'This authorization has reached its maximum lifetime. Reconnect the ' +
        'application to approve it again.',
    }
  }

  return issueTokens(payload, grantId, current)
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
