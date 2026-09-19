// The one screen a person actually sees in this flow.
//
// It is rendered as a self-contained HTML document rather than a React page on
// purpose. It must not inherit the public site's layout, header, or client
// bundle — this is a security decision surface, and everything on it should
// come from this file so that reviewing what the approver is shown means
// reading one function. It also has to render correctly for someone who arrived
// from a phone connector with no session yet, before any of the site's own
// chrome would make sense.
//
// **Every interpolated value is escaped.** `clientName` is chosen by whoever
// called the registration endpoint, which is anybody: it is the one string on
// this page an attacker controls, and it sits next to the word "Approve".

import { PUBLISH_CAPABILITY, type CapabilityRow } from './capabilities'

/** Escapes for use in an HTML text node or a double-quoted attribute. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const STYLE = `
:root { color-scheme: light dark; --bg:#faf9f7; --fg:#1a1a1a; --muted:#5c5c5c;
  --line:#dcd8d2; --card:#ffffff; --accent:#1a1a1a; --danger:#8a2b2b; }
@media (prefers-color-scheme: dark) { :root { --bg:#141414; --fg:#ececec;
  --muted:#a0a0a0; --line:#333; --card:#1d1d1d; --accent:#ececec; } }
* { box-sizing:border-box; }
body { margin:0; padding:2rem 1rem; background:var(--bg); color:var(--fg);
  font:16px/1.55 ui-sans-serif,-apple-system,Segoe UI,Roboto,sans-serif; }
main { max-width:34rem; margin:0 auto; background:var(--card);
  border:1px solid var(--line); border-radius:10px; padding:1.75rem; }
h1 { font-size:1.3rem; margin:0 0 .25rem; }
p { margin:.5rem 0; color:var(--muted); }
strong { color:var(--fg); }
fieldset { border:1px solid var(--line); border-radius:8px; margin:1.25rem 0;
  padding:.85rem 1rem; }
legend { padding:0 .4rem; font-size:.8rem; text-transform:uppercase;
  letter-spacing:.06em; color:var(--muted); }
label { display:flex; gap:.55rem; align-items:baseline; padding:.2rem 0; }
code { font:0.85em ui-monospace,SFMono-Regular,Menlo,monospace; }
.actions { display:flex; gap:.75rem; margin-top:1.5rem; }
button { font:inherit; padding:.6rem 1.1rem; border-radius:7px; cursor:pointer;
  border:1px solid var(--line); background:transparent; color:var(--fg); }
button.primary { background:var(--accent); color:var(--card); border-color:var(--accent); }
.warn { border-left:3px solid var(--danger); padding-left:.8rem; }
`

export type ConsentView = {
  clientName: string
  collections: CapabilityRow[]
  /** Pre-ticked capability ids, e.g. `posts.create`. */
  defaults: ReadonlySet<string>
  sealed: string
  tools: string[]
  userLabel: string
}

/** One checkbox. `id` is the form value; `checked` decides the default. */
function checkbox(id: string, label: string, checked: boolean): string {
  return (
    `<label><input type="checkbox" name="capability" value="${escapeHtml(id)}"` +
    `${checked ? ' checked' : ''}><span>${escapeHtml(label)}</span></label>`
  )
}

export function renderConsentPage(view: ConsentView): string {
  const collectionRows = view.collections
    .filter((row) => row.operations.length > 0)
    .map(
      (row) =>
        `<fieldset><legend>${escapeHtml(row.group)}</legend>` +
        row.operations
          .map((operation) =>
            checkbox(
              `${row.group}.${operation}`,
              operation,
              view.defaults.has(`${row.group}.${operation}`),
            ),
          )
          .join('') +
        `</fieldset>`,
    )
    .join('')

  const toolRows = view.tools
    .map((name) =>
      checkbox(`tool.${name}`, name, view.defaults.has(`tool.${name}`)),
    )
    .join('')

  // Never pre-ticked, whatever `defaults` says. Every other row on this form
  // may arrive checked because the plugin's own defaults do that for custom
  // tools; this one is the difference between a connector that drafts and one
  // that writes to the public site, so it is a decision the approver makes
  // rather than one they have to notice and undo.
  const publishRow = checkbox(
    PUBLISH_CAPABILITY,
    'Publish to the live site',
    false,
  )

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Authorize ${escapeHtml(view.clientName)}</title>
<style>${STYLE}</style></head>
<body><main>
<h1>Authorize ${escapeHtml(view.clientName)}</h1>
<p>It is asking to act on Beyond Every Art as
<strong>${escapeHtml(view.userLabel)}</strong>.</p>
<p class="warn">This name was supplied by the application itself and is not
verified. Approve it only if you started this connection.</p>
<form method="post" action="/oauth/authorize">
<input type="hidden" name="request" value="${escapeHtml(view.sealed)}">
${collectionRows}
<fieldset><legend>tools</legend>${toolRows}</fieldset>
<fieldset><legend>publishing</legend>${publishRow}</fieldset>
<p class="warn">Publishing puts a document on the public site. Grant it only to
a connector you control, and only if you intend to publish from it &mdash; a
drafting connector never needs it. It is off unless you tick it, and it does
nothing unless this account is an administrator.</p>
<div class="actions">
<button type="submit" name="decision" value="approve" class="primary">Approve</button>
<button type="submit" name="decision" value="deny">Deny</button>
</div>
</form>
</main></body></html>`
}

/** A dead end that never redirects, for a request too broken to be trusted. */
export function renderErrorPage(title: string, detail: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${escapeHtml(title)}</title><style>${STYLE}</style></head>
<body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(detail)}</p>
<p>Nothing has been authorized. You can close this page.</p>
</main></body></html>`
}
