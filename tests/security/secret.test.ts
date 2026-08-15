import { describe, expect, it } from 'vitest'

import {
  InsecurePayloadSecret,
  isServingProduction,
  PUBLISHED_PLACEHOLDER_SECRETS,
  resolvePayloadSecret,
} from '../../lib/security/secret'

describe('isServingProduction', () => {
  it('is true for a production server', () => {
    expect(isServingProduction({ NODE_ENV: 'production' })).toBe(true)
  })

  it('is false during next build, which runs as production without secrets', () => {
    // The Dockerfile's builder stage has no .env, correctly — a build must not
    // bake a secret in. Treating it as production would fail every image build.
    expect(
      isServingProduction({
        NODE_ENV: 'production',
        NEXT_PHASE: 'phase-production-build',
      }),
    ).toBe(false)
  })

  it('is false in development and test', () => {
    expect(isServingProduction({ NODE_ENV: 'development' })).toBe(false)
    expect(isServingProduction({ NODE_ENV: 'test' })).toBe(false)
    expect(isServingProduction({})).toBe(false)
  })
})

describe('resolvePayloadSecret', () => {
  it('returns a real secret in production', () => {
    const secret = 'a3f9c1e07b5d4826a1c3e5f70981b2d4'

    expect(
      resolvePayloadSecret({
        env: { NODE_ENV: 'production', PAYLOAD_SECRET: secret },
      }),
    ).toBe(secret)
  })

  it('refuses to start in production with no secret', () => {
    expect(() =>
      resolvePayloadSecret({ env: { NODE_ENV: 'production' } }),
    ).toThrow(InsecurePayloadSecret)
  })

  it('refuses whitespace, which reads as set but signs like empty', () => {
    expect(() =>
      resolvePayloadSecret({
        env: { NODE_ENV: 'production', PAYLOAD_SECRET: '   ' },
      }),
    ).toThrow(InsecurePayloadSecret)
  })

  it.each(PUBLISHED_PLACEHOLDER_SECRETS)(
    'refuses the published placeholder %s',
    (placeholder) => {
      expect(() =>
        resolvePayloadSecret({
          env: { NODE_ENV: 'production', PAYLOAD_SECRET: placeholder },
        }),
      ).toThrow(InsecurePayloadSecret)
    },
  )

  it('refuses a placeholder whatever its casing', () => {
    expect(() =>
      resolvePayloadSecret({
        env: {
          NODE_ENV: 'production',
          PAYLOAD_SECRET: 'Development-Only-Change-Me',
        },
      }),
    ).toThrow(InsecurePayloadSecret)
  })

  it('says what to do about it', () => {
    expect(() =>
      resolvePayloadSecret({ env: { NODE_ENV: 'production' } }),
    ).toThrow(/openssl rand -hex 32/)
  })

  it('lets a build through so the image can be produced without secrets', () => {
    expect(
      resolvePayloadSecret({
        env: {
          NODE_ENV: 'production',
          NEXT_PHASE: 'phase-production-build',
        },
      }),
    ).toBe('')
  })

  it('leaves development and CI alone, including on a placeholder', () => {
    expect(
      resolvePayloadSecret({
        env: {
          NODE_ENV: 'test',
          PAYLOAD_SECRET: PUBLISHED_PLACEHOLDER_SECRETS[0],
        },
      }),
    ).toBe(PUBLISHED_PLACEHOLDER_SECRETS[0])
  })
})
