import { describe, expect, it } from 'vitest'

import { validateBootstrapPassword } from '../../scripts/bootstrap-admin'

describe('administrator bootstrap password validation', () => {
  it('accepts a long password containing multiple character classes', () => {
    expect(() => validateBootstrapPassword('Migration!Admin2026')).not.toThrow()
  })

  it('rejects short passwords', () => {
    expect(() => validateBootstrapPassword('Short!1')).toThrow(
      'at least 14 characters',
    )
  })

  it('rejects long passwords with insufficient character variety', () => {
    expect(() => validateBootstrapPassword('onlylowercasepassword')).toThrow(
      'at least three',
    )
  })
})
