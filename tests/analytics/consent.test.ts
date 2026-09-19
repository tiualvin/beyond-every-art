import { describe, expect, it } from 'vitest'

import {
  CONSENT_SIGNALS,
  CONSENT_WAIT_MS,
  consentBootstrap,
  consentDefaults,
  RESTRICTED_REGIONS,
} from '@/lib/analytics/consent'

describe('consentDefaults', () => {
  // The pair is the whole design: granted where no banner is shown, denied
  // where one is, and Google resolves the overlap by specificity.
  it('grants everywhere and denies in the regions with a banner', () => {
    const [global, restricted] = consentDefaults({})

    expect(global.region).toBeUndefined()
    expect(global.analytics_storage).toBe('granted')

    expect(restricted.region).toEqual(RESTRICTED_REGIONS)
    expect(restricted.analytics_storage).toBe('denied')
  })

  it('declares all four signals in every command', () => {
    for (const command of consentDefaults({})) {
      for (const signal of CONSENT_SIGNALS) {
        expect(command[signal], signal).toMatch(/^(granted|denied)$/)
      }
    }
  })

  // Without this a tag can fire, and set a cookie, in the gap between the page
  // loading and the banner being answered — which is the gap this exists to
  // close, so the wait belongs on the command that denies.
  it('waits for the banner only where it denies', () => {
    const [global, restricted] = consentDefaults({})

    expect(global.wait_for_update).toBeUndefined()
    expect(restricted.wait_for_update).toBe(CONSENT_WAIT_MS)
  })

  it('covers the EEA, the UK and Switzerland, and nothing else', () => {
    expect(RESTRICTED_REGIONS).toContain('DE')
    expect(RESTRICTED_REGIONS).toContain('IE')
    // EEA but not EU.
    expect(RESTRICTED_REGIONS).toContain('NO')
    // Outside both, required all the same.
    expect(RESTRICTED_REGIONS).toContain('GB')
    expect(RESTRICTED_REGIONS).toContain('CH')
    // Not in scope, and denying here would be denying forever: Google's CMP
    // shows nothing to these readers, so nothing would ever update them.
    expect(RESTRICTED_REGIONS).not.toContain('US')
    expect(RESTRICTED_REGIONS).not.toContain('CA')
    expect(RESTRICTED_REGIONS).not.toContain('AU')
  })

  // The conservative reading, for a worldwide banner or a CMP misconfiguration
  // that needs covering without a deploy.
  it('denies everywhere when the scope is switched to all', () => {
    const commands = consentDefaults({ NEXT_PUBLIC_CONSENT_SCOPE: 'all' })

    expect(commands).toHaveLength(1)
    expect(commands[0].region).toBeUndefined()
    expect(commands[0].analytics_storage).toBe('denied')
    expect(commands[0].wait_for_update).toBe(CONSENT_WAIT_MS)
  })

  it('ignores case and stray whitespace in the switch', () => {
    expect(
      consentDefaults({ NEXT_PUBLIC_CONSENT_SCOPE: '  ALL ' }),
    ).toHaveLength(1)
    // Anything unrecognised falls back to the regional pair rather than to a
    // blanket denial — a typo should not turn analytics off worldwide.
    expect(consentDefaults({ NEXT_PUBLIC_CONSENT_SCOPE: 'eea' })).toHaveLength(
      2,
    )
    expect(
      consentDefaults({ NEXT_PUBLIC_CONSENT_SCOPE: 'nonsense' }),
    ).toHaveLength(2)
  })
})

describe('consentBootstrap', () => {
  const script = consentBootstrap({})

  // The order Google's own snippet uses, and the order the browser needs:
  // `dataLayer` and `gtag` have to exist before anything is pushed to them.
  it('creates dataLayer and gtag before it pushes anything', () => {
    expect(script.indexOf('window.dataLayer')).toBeLessThan(
      script.indexOf("gtag('consent'"),
    )
    expect(script.indexOf('function gtag')).toBeLessThan(
      script.indexOf("gtag('consent'"),
    )
  })

  it('emits one default command per resolved default', () => {
    expect(script.match(/gtag\('consent','default'/g)).toHaveLength(2)
    expect(
      consentBootstrap({ NEXT_PUBLIC_CONSENT_SCOPE: 'all' }).match(
        /gtag\('consent','default'/g,
      ),
    ).toHaveLength(1)
  })

  // The companion setting Google documents alongside a denied default: with
  // `ad_storage` denied it strips ad click identifiers from Google's requests,
  // and it costs nothing where consent is granted.
  it('redacts ad click identifiers where storage is denied', () => {
    expect(script).toContain("gtag('set','ads_data_redaction',true);")
  })

  // The script body is interpolated into a `<script>` element, so a value that
  // could carry a quote or a closing tag would break out of it. Everything here
  // comes from literals in the module or `JSON.stringify` of them, which is why
  // the scope switch is two values rather than a region list somebody types.
  it('puts nothing operator-supplied into the script body', () => {
    const hostile = consentBootstrap({
      NEXT_PUBLIC_CONSENT_SCOPE: '</script><script>alert(1)//',
    })

    expect(hostile).not.toContain('<script')
    expect(hostile).not.toContain('alert')
    // An unrecognised value is the regional pair, unchanged.
    expect(hostile).toBe(consentBootstrap({}))
  })
})
