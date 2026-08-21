import { describe, expect, it } from 'vitest'

import {
  fetchPublicBytes,
  isPublicAddress,
  OutboundFetchError,
} from '../../lib/security/outbound-fetch'

// The address check is the whole guard. `uploadMediaFromUrl` makes this server
// fetch an address a caller chose, and this server sits inside a private
// network with a database, other containers reachable by name, and on some
// hosts a metadata service that hands out credentials to anything that asks.
// Every case below is an address that must never be connected to.
describe('isPublicAddress', () => {
  it.each([
    ['1.1.1.1', 'a public resolver'],
    ['8.8.8.8', 'another public resolver'],
    ['93.184.216.34', 'an ordinary public host'],
    ['2606:4700:4700::1111', 'a public IPv6 address'],
  ])('allows %s (%s)', (address) => {
    expect(isPublicAddress(address)).toBe(true)
  })

  it.each([
    ['127.0.0.1', 'loopback — the app itself, and Payload with no proxy'],
    ['127.1.1.1', 'the rest of 127/8, which is all loopback'],
    ['0.0.0.0', '"this network"'],
    ['10.0.0.5', 'RFC 1918'],
    ['172.16.0.1', 'RFC 1918, bottom of the range'],
    ['172.31.255.254', 'RFC 1918, top of the range'],
    ['192.168.1.1', 'RFC 1918'],
    ['169.254.169.254', 'link-local — the cloud metadata service'],
    ['100.64.0.1', 'carrier-grade NAT'],
    ['198.18.0.1', 'benchmarking'],
    ['224.0.0.1', 'multicast'],
    ['255.255.255.255', 'broadcast'],
  ])('refuses %s (%s)', (address) => {
    expect(isPublicAddress(address)).toBe(false)
  })

  // 172.16/12 is the range most often got wrong — 172.15 and 172.32 are public.
  it('gets the edges of 172.16/12 right', () => {
    expect(isPublicAddress('172.15.255.255')).toBe(true)
    expect(isPublicAddress('172.32.0.1')).toBe(true)
    expect(isPublicAddress('172.16.0.0')).toBe(false)
    expect(isPublicAddress('172.31.0.0')).toBe(false)
  })

  it.each([
    ['::1', 'IPv6 loopback'],
    ['::', 'the unspecified address'],
    ['fc00::1', 'unique local'],
    ['fd12:3456::1', 'unique local, the half people actually use'],
    ['fe80::1', 'link-local'],
    ['ff02::1', 'multicast'],
  ])('refuses %s (%s)', (address) => {
    expect(isPublicAddress(address)).toBe(false)
  })

  // An IPv4 address wearing an IPv6 hat. Checking these as "some IPv6 string"
  // waves loopback straight through, which is the bypass this catches.
  it.each([
    '::ffff:127.0.0.1',
    '::ffff:169.254.169.254',
    '::ffff:10.0.0.1',
    '::127.0.0.1',
  ])('refuses the IPv4-mapped address %s', (address) => {
    expect(isPublicAddress(address)).toBe(false)
  })

  it('allows an IPv4-mapped address that is genuinely public', () => {
    expect(isPublicAddress('::ffff:8.8.8.8')).toBe(true)
  })

  // Both of these embed an IPv4 address inside an IPv6 one, so a private
  // address can be smuggled through a check that only looks at the prefix.
  it.each([
    ['64:ff9b::1', 'NAT64'],
    ['2002:7f00:0001::', '6to4 wrapping 127.0.0.1'],
  ])('refuses %s (%s)', (address) => {
    expect(isPublicAddress(address)).toBe(false)
  })

  it('refuses a zone-suffixed link-local address', () => {
    expect(isPublicAddress('fe80::1%eth0')).toBe(false)
  })

  it.each(['', 'not-an-address', 'localhost', 'postgres', '999.1.1.1'])(
    'refuses %j, which is not an address at all',
    (value) => {
      expect(isPublicAddress(value)).toBe(false)
    },
  )
})

// The refusals that happen before a socket is opened. None of these touch the
// network: the scheme check is local, and a hostname resolving to loopback is
// answered by the resolver without leaving the machine.
describe('fetchPublicBytes', () => {
  const refuse = (url: string) => fetchPublicBytes(url, 8 * 1024 * 1024)

  it.each([
    ['http://example.com/x.png', 'plaintext http'],
    ['file:///etc/passwd', 'the local filesystem'],
    ['data:image/png;base64,AAAA', 'an inline payload'],
    ['gopher://example.com/x', 'a protocol smuggling scheme'],
  ])('refuses %s (%s)', async (url) => {
    await expect(refuse(url)).rejects.toBeInstanceOf(OutboundFetchError)
  })

  it('refuses a literal private address', async () => {
    await expect(refuse('https://127.0.0.1/x.png')).rejects.toThrow(
      /not a public address/,
    )
  })

  it('refuses a literal link-local address, which is the metadata service', async () => {
    await expect(
      refuse('https://169.254.169.254/latest/meta-data/'),
    ).rejects.toThrow(/not a public address/)
  })

  it('refuses a bracketed IPv6 loopback', async () => {
    await expect(refuse('https://[::1]/x.png')).rejects.toThrow(
      /not a public address/,
    )
  })

  // The case that makes hostname allowlisting useless: the name is innocuous
  // and the address it resolves to is not. Anyone can publish such a record.
  it('refuses a hostname that resolves to loopback', async () => {
    await expect(refuse('https://localhost/x.png')).rejects.toThrow(
      /not a public address/,
    )
  })

  it('refuses something that is not a URL', async () => {
    await expect(refuse('not a url')).rejects.toThrow(/not a valid URL/)
  })
})
