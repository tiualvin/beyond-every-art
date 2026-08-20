import { NextResponse } from 'next/server'

import {
  METADATA_CACHE_CONTROL,
  issuerOrigin,
  oauthEnabled,
} from '@/lib/oauth/config'
import { protectedResourceMetadata } from '@/lib/oauth/metadata'

// RFC 9728 protected resource metadata — the first document a client fetches,
// named by the `WWW-Authenticate` header on the MCP endpoint's 401.
//
// The optional catch-all segment is not decoration. RFC 9728 §3.1 builds the
// metadata URL by inserting the resource's *path* after the well-known prefix,
// so the canonical URL for `https://cms.example.com/api/mcp` is
// `/.well-known/oauth-protected-resource/api/mcp` — while plenty of clients ask
// for the bare `/.well-known/oauth-protected-resource` instead. Both are the
// same document here, and answering both is the difference between a connector
// that discovers this server and one that reports it as unauthenticated.
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

  return NextResponse.json(protectedResourceMetadata(origin), {
    headers: { 'Cache-Control': METADATA_CACHE_CONTROL },
  })
}
