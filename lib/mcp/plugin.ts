// MCP server configuration.
//
// The endpoint is `POST /api/mcp`, served through the existing Payload
// catch-all route. Three independent gates govern it, and all three have to
// pass: the allowlist below (changed by a deploy), the per-key capability
// checkboxes in the admin panel (changed in real time), and Payload's own
// access control, which the plugin's tools invoke with `overrideAccess: false`
// and the key's user — so `access/roles.ts` stays the only authority on what an
// agent may do.
//
// Nothing is exposed that is not named here. `members`, `billing-events`,
// `newsletter-signups`, and `users` hold personal, billing, and credential data
// and are deliberately absent; there is no editorial reason for an agent to
// reach them.
//
// See `docs/MCP_SERVER.md`.

import { mcpPlugin, type MCPPluginConfig } from '@payloadcms/plugin-mcp'
import type { PayloadRequest, Plugin } from 'payload'

import { logMcpEvent, mcpSessionLogEntry } from './audit'
import { FixedWindowRateLimiter, rateLimitKey } from './rate-limit'
import { mcpTools } from './tools'

/** Requests per key per minute. Generous for a person, bounded for a flood. */
const RATE_LIMIT = 120
const RATE_WINDOW_MS = 60_000

const limiter = new FixedWindowRateLimiter(RATE_LIMIT, RATE_WINDOW_MS)

/**
 * Whether the MCP endpoint is mounted at all.
 *
 * Off unless explicitly enabled, so a deployment gains a public write endpoint
 * only when somebody decides it should have one. The plugin keeps its API-key
 * collection either way, which is what stops the database schema from
 * depending on an environment variable.
 */
export const mcpEnabled = (env = process.env): boolean =>
  env.MCP_ENABLED === '1'

export const mcpPluginConfig: MCPPluginConfig = {
  collections: {
    authors: {
      description: 'Public bylines. Read-only over MCP.',
      enabled: { find: true },
    },
    media: {
      description:
        'Images. Use `uploadMedia` to add one — the generated create tool ' +
        'cannot carry a file, so a document made through it would have no ' +
        'image attached. Editing and deleting stay in the admin panel.',
      enabled: { find: true },
    },
    posts: {
      description:
        'Articles. Bodies are stored as Lexical rich text, so use ' +
        '`draftArticle` and `updateArticleMarkdown` to write them rather than ' +
        'setting `content` directly. Migrated articles render from `legacyHTML`. ' +
        'Prefer `select` to avoid pulling whole bodies into context.',
      // No `delete`: an agent that removes an article is not a workflow this
      // project wants, and the admin panel is two clicks away.
      enabled: { create: true, delete: false, find: true, update: true },
    },
    tags: {
      description: 'Tags used for article categorisation.',
      enabled: { find: true, update: true },
    },
  },
  disabled: !mcpEnabled(),
  mcp: {
    tools: mcpTools,
  },
  // Wraps the plugin's own key resolution rather than replacing it: the
  // bearer key is still verified against `payload-mcp-api-keys` exactly as
  // before. This adds what the endpoint needs now that it is reachable from
  // the internet — a bound on request volume, and a record of which key acted.
  overrideAuth: async (req, getDefaultMcpAccessSettings) => {
    const limit = limiter.check(rateLimitKey(req.headers.get('Authorization')))
    if (!limit.allowed) {
      throw new Error(
        'Rate limit exceeded for this MCP key. Try again shortly.',
      )
    }

    const settings = await getDefaultMcpAccessSettings()
    const user = (settings as { user?: { id?: unknown; role?: unknown } }).user

    // The plugin resolves the key's user and hands it to its own generated
    // tools, but never puts it on the request. Custom tools only receive `req`,
    // and so do collection hooks — so without this the drafting tools run
    // anonymously and fail Posts' `authenticated` create rule, while the
    // publish guard and the audit log see no role at all. Assigning it here is
    // what makes `req.user` mean the same thing on every MCP path.
    if (user) req.user = user as NonNullable<PayloadRequest['user']>

    logMcpEvent(
      mcpSessionLogEntry({
        key: (settings as { label?: unknown }).label,
        role: user?.role,
        userId: user?.id,
      }),
    )

    return settings
  },
  userCollection: 'users',
}

export const mcp = (): Plugin => mcpPlugin(mcpPluginConfig)
