// Whether a peer is Cloudflare, which is what decides whether
// `CF-Connecting-IP` is a fact or a suggestion.
//
// The bypass this closes is worth restating, because the failure is silent: the
// header becomes the rate-limit key, so a caller who can write it freely gets a
// fresh allowance per request and every limiter in the application stops
// bounding anything. Measured against a production build before the fix, ten
// requests against a limit of three were ten successes.

import { describe, expect, it } from 'vitest'

import {
  CLOUDFLARE_IPV4,
  CLOUDFLARE_IPV6,
  isCloudflareAddress,
} from '../../lib/security/cloudflare'

describe('the published range lists', () => {
  it('are well-formed CIDR, so a typo cannot silently match nothing', () => {
    for (const cidr of CLOUDFLARE_IPV4) {
      expect(cidr).toMatch(/^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/)
      expect(Number(cidr.split('/')[1])).toBeLessThanOrEqual(32)
    }
    for (const cidr of CLOUDFLARE_IPV6) {
      expect(cidr).toMatch(/^[0-9a-f:]+\/\d{1,3}$/i)
      expect(Number(cidr.split('/')[1])).toBeLessThanOrEqual(128)
    }
  })

  it('contain the ranges the firewall rules are also built from', () => {
    // Spot-checked against cloudflare.com/ips-v4. If Cloudflare publishes a
    // change, this is the list EDGE_PROTECTION.md pass two must change too.
    expect(CLOUDFLARE_IPV4).toContain('104.16.0.0/13')
    expect(CLOUDFLARE_IPV4).toContain('172.64.0.0/13')
    expect(CLOUDFLARE_IPV6).toContain('2606:4700::/32')
  })
})

describe('isCloudflareAddress', () => {
  it('recognises an address inside a range', () => {
    expect(isCloudflareAddress('104.16.0.1')).toBe(true)
    expect(isCloudflareAddress('172.64.200.5')).toBe(true)
    expect(isCloudflareAddress('131.0.72.4')).toBe(true)
  })

  it('refuses an address just outside every range', () => {
    // The 104.x space is two adjacent ranges: 104.16.0.0/13 reaches
    // 104.23.255.255 and 104.24.0.0/14 reaches 104.27.255.255. So the first
    // address past both is 104.28.0.0, and the last before them 104.15.255.255
    // — the pair an off-by-one in the prefix mask would let through.
    expect(isCloudflareAddress('104.28.0.0')).toBe(false)
    expect(isCloudflareAddress('104.15.255.255')).toBe(false)
    // Both edges are inside, which is the other half of the same boundary.
    expect(isCloudflareAddress('104.23.255.255')).toBe(true)
    expect(isCloudflareAddress('104.27.255.255')).toBe(true)
  })

  it('refuses ordinary public and private addresses', () => {
    expect(isCloudflareAddress('203.0.113.9')).toBe(false)
    expect(isCloudflareAddress('8.8.8.8')).toBe(false)
    expect(isCloudflareAddress('10.0.0.1')).toBe(false)
    expect(isCloudflareAddress('127.0.0.1')).toBe(false)
  })

  it('handles IPv6, including the mapped form a dual-stack listener reports', () => {
    expect(isCloudflareAddress('2606:4700::1')).toBe(true)
    expect(isCloudflareAddress('2a06:98c0::1')).toBe(true)
    expect(isCloudflareAddress('2001:db8::1')).toBe(false)
    // `::ffff:104.16.0.1` is an IPv4 peer seen through an IPv6 socket, so it
    // has to be compared against the IPv4 list rather than missing everything.
    expect(isCloudflareAddress('::ffff:104.16.0.1')).toBe(true)
    expect(isCloudflareAddress('::ffff:203.0.113.9')).toBe(false)
  })

  it('answers false for anything it cannot parse', () => {
    // The safe direction: an unreadable peer falls back to keying on the peer
    // string itself, which throttles. It never extends trust.
    expect(isCloudflareAddress(undefined)).toBe(false)
    expect(isCloudflareAddress('')).toBe(false)
    expect(isCloudflareAddress('not-an-address')).toBe(false)
    expect(isCloudflareAddress('104.16.0')).toBe(false)
    expect(isCloudflareAddress('999.999.999.999')).toBe(false)
    // Leading zeroes are rejected rather than coerced: a permissive parse reads
    // `104.016.0.1` as an address in a range it is not in.
    expect(isCloudflareAddress('104.016.0.1')).toBe(false)
  })

  it('ignores a zone suffix on a link-local peer', () => {
    expect(isCloudflareAddress('fe80::1%eth0')).toBe(false)
  })
})
