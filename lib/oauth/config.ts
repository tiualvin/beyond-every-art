// Whether the OAuth layer exists, and where it says it lives.
//
// Two flags, deliberately separate. `MCP_ENABLED` mounts the MCP endpoint;
// `MCP_OAUTH_ENABLED` mounts the authorization server in front of it. Keeping
// them apart means the endpoint that already works with API keys is not
// disturbed by turning issuance on, and issuance can be turned off in an
// incident without taking the CLI clients down with it.
//
// Both default off. This adds unauthenticated, publicly reachable write
// endpoints — registration in particular — so a deployment gains them only when
// somebody decides it should.

import { cmsOrigin } from '../security/origins'

export const oauthEnabled = (env = process.env): boolean =>
  env.MCP_OAUTH_ENABLED === '1'

/**
 * The issuer, which every document and every token is scoped to.
 *
 * Derived from `CMS_ADDRESS` rather than from the request's own `Host`, and
 * that is the point: an issuer taken from the request is an issuer an attacker
 * chooses, and every URL in the discovery documents would then point wherever
 * the `Host` header said. Returning null when it is unset makes the endpoints
 * refuse rather than advertise something wrong.
 */
export const issuerOrigin = (env = process.env): string | null => cmsOrigin(env)

/** Discovery documents are public, cacheable, and must not be stale for long. */
export const METADATA_CACHE_CONTROL = 'public, max-age=300'

/**
 * The largest body any OAuth endpoint will read.
 *
 * All four are unauthenticated POSTs — that is what an authorization server
 * is — so without a ceiling the caller chooses how much memory one request
 * allocates before anything is validated. The bodies themselves are tiny: a
 * form-encoded grant request, a token, a registration's redirect URIs, or the
 * consent form's sealed blob and its ticked boxes. Sixteen kilobytes is the
 * same ceiling `/csp-report` uses, and for the same reason.
 *
 * It said "all three" until `/oauth/register` was found still reading its body
 * with `request.json()` — the endpoint the count had quietly omitted was the
 * one that had not been given the ceiling. Kept accurate here because this
 * comment is where the next person checks whether their endpoint is covered.
 */
export const MAX_OAUTH_BODY_BYTES = 16_000
