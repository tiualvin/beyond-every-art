import { NextResponse } from 'next/server'

import {
  METADATA_CACHE_CONTROL,
  issuerOrigin,
  oauthEnabled,
} from '@/lib/oauth/config'
import { authorizationServerMetadata } from '@/lib/oauth/metadata'

// RFC 8414 authorization server metadata — how a client learns where to
// register, where to send the user, and that PKCE with S256 is required.
//
// Same optional catch-all as the resource document, for the same reason:
// clients differ on whether they append the issuer's path.
export const dynamic = 'force-dynamic'

export function GET(): NextResponse {
  if (!oauthEnabled()) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 })
  }

  const origin = issuerOrigin()
  if (!origin) {
    return NextResponse.json(
      { message: 'This deployment has no configured CMS origin.' },
      { status: 503 },
    )
  }

  return NextResponse.json(authorizationServerMetadata(origin), {
    headers: { 'Cache-Control': METADATA_CACHE_CONTROL },
  })
}
