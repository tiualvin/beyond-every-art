import { describe, expect, it } from 'vitest'

import { basicAuthorizationFromEnvironment } from '../../lib/migration-verification/auth'

describe('basicAuthorizationFromEnvironment', () => {
  it('resolves only an environment variable name', () => {
    const header = basicAuthorizationFromEnvironment('CRAWL_AUTH', {
      CRAWL_AUTH: 'crawler:temporary secret',
    })
    expect(header).toBe('Basic Y3Jhd2xlcjp0ZW1wb3Jhcnkgc2VjcmV0')
  })

  it('rejects CLI-like values, missing values, and header injection', () => {
    expect(() =>
      basicAuthorizationFromEnvironment('user:password', {}),
    ).toThrow('name is invalid')
    expect(() => basicAuthorizationFromEnvironment('MISSING_AUTH', {})).toThrow(
      'is not set: MISSING_AUTH',
    )
    expect(() =>
      basicAuthorizationFromEnvironment('CRAWL_AUTH', {
        CRAWL_AUTH: 'user:password\r\nX-Leak: yes',
      }),
    ).toThrow('must contain user:password: CRAWL_AUTH')
  })

  it('returns undefined when authentication is not requested', () => {
    expect(basicAuthorizationFromEnvironment(undefined, {})).toBeUndefined()
  })
})
