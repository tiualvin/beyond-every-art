import { NextResponse } from 'next/server'

import { issuerOrigin, oauthEnabled } from '@/lib/oauth/config'
import { revokeByToken } from '@/lib/oauth/grants'
import { getPayloadClient } from '@/lib/payload'

// RFC 7009 revocation.
//
// Answers 200 whether or not the token existed, which the RFC requires in §2.2:
// a revocation endpoint that distinguished them would be an oracle for testing
// whether a stolen token is still live.
//
// Revoking either token kills the whole grant — see `revokeByToken` for why
// that is the less surprising reading of the request.
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<NextResponse> {
  if (!oauthEnabled() || !issuerOrigin()) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 })
  }

  let token: string | null = null
  try {
    const contentType = request.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      const body = (await request.json()) as { token?: unknown }
      token = typeof body.token === 'string' ? body.token : null
    } else {
      token = new URLSearchParams(await request.text()).get('token')
    }
  } catch {
    token = null
  }

  if (token) {
    const payload = await getPayloadClient()
    await revokeByToken(payload, token)
  }

  return new NextResponse(null, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  })
}
