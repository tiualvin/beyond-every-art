import { describe, expect, it } from 'vitest'

import { PUBLISH_CAPABILITY } from '../../lib/oauth/capabilities'
import {
  escapeHtml,
  renderConsentPage,
  renderErrorPage,
} from '../../lib/oauth/consent-page'

const view = (clientName: string) => ({
  clientName,
  collections: [{ group: 'posts', operations: ['create', 'find'] }],
  defaults: new Set(['posts.create']),
  sealed: 'sealed.value',
  tools: ['draftArticle'],
  userLabel: 'editor@example.test',
})

describe('escapeHtml', () => {
  it('escapes every character that could break out of markup', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;')
  })
})

describe('renderConsentPage', () => {
  // `clientName` is chosen by whoever called the registration endpoint, which
  // is anybody. It is rendered next to an Approve button, on a page carrying an
  // admin session cookie — the single most valuable place to land script on
  // this deployment.
  it('escapes a client name carrying a script tag', () => {
    const html = renderConsentPage(view('<script>alert(1)</script>'))
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('escapes a client name that tries to break out of the title attribute', () => {
    const html = renderConsentPage(view('" onload="alert(1)'))
    expect(html).not.toContain('onload="alert(1)"')
  })

  it('renders a checkbox per enabled operation', () => {
    const html = renderConsentPage(view('Claude'))
    expect(html).toContain('value="posts.create"')
    expect(html).toContain('value="posts.find"')
    expect(html).toContain('value="tool.draftArticle"')
  })

  it('pre-ticks only the defaults it was given', () => {
    const html = renderConsentPage(view('Claude'))
    expect(html).toMatch(/value="posts\.create"\s*checked/)
    expect(html).not.toMatch(/value="posts\.find"\s*checked/)
  })

  it('carries the sealed request and nothing else security-bearing', () => {
    const html = renderConsentPage(view('Claude'))
    expect(html).toContain('name="request"')
    // The redirect URI must not appear as a form field; the POST reads it from
    // inside the seal, so a field here would be an editable one.
    expect(html).not.toContain('name="redirect_uri"')
    expect(html).not.toContain('name="client_id"')
  })

  // Publishing used to be refused outright and the page said so. It is now
  // grantable, which makes how it is *offered* the thing worth holding: one
  // row, never pre-ticked, with the consequence stated next to it.
  it('offers publishing as a row the approver has to tick', () => {
    const html = renderConsentPage(view('Claude'))
    expect(html).toContain(`value="${PUBLISH_CAPABILITY}"`)
  })

  it('never pre-ticks publishing, whatever the defaults say', () => {
    // `defaults` arrives from the plugin, whose custom-tool checkboxes default
    // to ticked. If this row ever followed that, an approval made by reflex
    // would hand a connector the live site.
    const html = renderConsentPage({
      ...view('Claude'),
      defaults: new Set([PUBLISH_CAPABILITY]),
    })

    const row = html.slice(html.indexOf(`value="${PUBLISH_CAPABILITY}"`))
    expect(row.slice(0, row.indexOf('>'))).not.toContain('checked')
  })

  it('says what publishing means, next to where it is granted', () => {
    expect(renderConsentPage(view('Claude'))).toContain(
      'Publishing puts a document on the public site',
    )
  })

  it('says the name is unverified, because it is', () => {
    expect(renderConsentPage(view('Claude'))).toMatch(/not\s+verified/)
  })

  it('asks not to be indexed', () => {
    expect(renderConsentPage(view('Claude'))).toContain('noindex')
  })
})

describe('renderErrorPage', () => {
  it('escapes what it is given', () => {
    const html = renderErrorPage('<b>t</b>', '<i>d</i>')
    expect(html).not.toContain('<b>t</b>')
    expect(html).toContain('&lt;b&gt;')
  })

  it('says plainly that nothing was authorized', () => {
    expect(renderErrorPage('t', 'd')).toContain('Nothing has been authorized')
  })
})
