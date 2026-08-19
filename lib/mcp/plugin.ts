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

import { adminIssuableApiKeys } from './api-keys'
import {
  logMcpEvent,
  mcpAuthLogEntry,
  mcpEventLogEntry,
  mcpRefusedLogEntry,
} from './audit'
import { methodNotAllowedError, rateLimitedError } from './errors'
import {
  clientKey,
  configuredLimit,
  FixedWindowRateLimiter,
  rateLimitKey,
  retryAfterSeconds,
} from './rate-limit'
import { elideArticleBodies } from './response'
import { mcpTools } from './tools'

/**
 * Requests per key per minute, unless `RATE_LIMIT_MCP_PER_MINUTE` says
 * otherwise. Generous for a person, bounded for a flood.
 */
const RATE_LIMIT = 120
const RATE_WINDOW_MS = 60_000

const limiter = new FixedWindowRateLimiter(
  configuredLimit('RATE_LIMIT_MCP_PER_MINUTE', RATE_LIMIT),
  RATE_WINDOW_MS,
)

/**
 * Failed authentications per source address per fifteen minutes.
 *
 * The limiter above cannot bound key guessing, and reading it as though it
 * could was the gap this closes: it buckets on the credential the caller
 * presents, so every guess arrives in a fresh bucket holding a full allowance,
 * and each one still buys the database lookup that resolves a key. A thousand
 * guesses were a thousand lookups and a thousand windows.
 *
 * So guessing is bounded by where the request came from instead, and only
 * failures are counted — a caller holding a working key never touches this,
 * however much traffic it sends. Ten is far more wrong keys than a
 * misconfigured client produces and far fewer than a search needs.
 *
 * Source addresses are shared between MCP callers (the requests come from a
 * vendor's cloud), so a client looping on a revoked key can spend this budget
 * for another caller behind the same address. That trade is deliberate: the
 * cost is that a *second* misconfigured client waits fifteen minutes, and the
 * alternative is leaving the endpoint's only credential open to unlimited
 * guessing.
 */
const AUTH_FAILURE_LIMIT = 10
const AUTH_FAILURE_WINDOW_MS = 15 * 60_000

const failedAuthLimiter = new FixedWindowRateLimiter(
  configuredLimit('RATE_LIMIT_MCP_AUTH_FAILURES', AUTH_FAILURE_LIMIT),
  AUTH_FAILURE_WINDOW_MS,
)

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
      // The description above asks for `select`; this is what happens when an
      // agent does not pass one. Bodies are summarised rather than returned,
      // so an unbounded `findPosts` costs a listing instead of every migrated
      // article's full Ghost markup.
      overrideResponse: elideArticleBodies('posts'),
    },
    tags: {
      description: 'Tags used for article categorisation.',
      enabled: { find: true, update: true },
    },
  },
  disabled: !mcpEnabled(),
  mcp: {
    handlerOptions: {
      // The only place a tool call is visible as a tool call. `recordMcpWrite`
      // sees writes, and `overrideAuth` below sees keys, but neither sees a
      // read — so without this a key that does nothing but pull articles out of
      // the database leaves no trace. Nothing here reads the call's arguments;
      // see `mcpEventLogEntry` for why that matters.
      onEvent: (event) => {
        const entry = mcpEventLogEntry(event)
        if (entry) logMcpEvent(entry)
      },
    },
    tools: mcpTools,
  },
  // Wraps the plugin's own key resolution rather than replacing it: the
  // bearer key is still verified against `payload-mcp-api-keys` exactly as
  // before. This adds what the endpoint needs now that it is reachable from
  // the internet — a bound on request volume, and a record of which key acted.
  overrideAuth: async (req, getDefaultMcpAccessSettings) => {
    // Refused before anything is spent on it. The plugin registers `GET` only
    // to answer "Method not allowed", but routes it through this hook first —
    // so an unauthenticated probe would otherwise cost a key lookup and a
    // failed-authentication count against a source address shared by every MCP
    // caller behind the same vendor cloud. See `methodNotAllowedError`.
    if (req.method?.toUpperCase() === 'GET') throw methodNotAllowedError()

    const caller = rateLimitKey(req.headers.get('Authorization'))
    const source = clientKey(req.headers)

    const limit = limiter.check(caller)
    if (!limit.allowed) {
      // The window is already computed; saying when it reopens is the
      // difference between an agent that waits and one that retries in a loop.
      const retryAfter = retryAfterSeconds(limit.resetAt)
      logMcpEvent(
        mcpRefusedLogEntry({ caller, reason: 'rate_limited', retryAfter }),
      )
      throw rateLimitedError(
        `Rate limit exceeded for this MCP key. Try again in ${retryAfter} seconds.`,
      )
    }

    // Checked, not spent: a request that turns out to hold a working key must
    // not count against the guessing budget. Only the failure path below
    // records anything.
    const failures = failedAuthLimiter.peek(source)
    if (!failures.allowed) {
      const retryAfter = retryAfterSeconds(failures.resetAt)
      logMcpEvent(
        mcpRefusedLogEntry({ caller, reason: 'rate_limited', retryAfter }),
      )
      throw rateLimitedError(
        `Too many failed MCP authentications from this address. Try again in ${retryAfter} seconds.`,
      )
    }

    let settings
    try {
      settings = await getDefaultMcpAccessSettings()
    } catch (error) {
      // A missing or unrecognised key. This throws before the MCP handler is
      // entered, so `onEvent` never sees it either — without this line, a run
      // of guessed keys against a publicly reachable endpoint is invisible.
      failedAuthLimiter.check(source)
      logMcpEvent(mcpRefusedLogEntry({ caller, reason: 'unauthorized' }))
      throw error
    }

    const user = (settings as { user?: { id?: unknown; role?: unknown } }).user

    // Belt and braces. At `3.86.0` the plugin resolved the key's user, handed
    // it to its own generated tools, and never put it on the request — so the
    // custom tools, which receive only `req`, ran anonymously and failed Posts'
    // `authenticated` create rule, while the publish guard and the audit log
    // saw no role at all. `3.88.0` assigns `req.user` itself, immediately after
    // this hook returns. Keeping the assignment costs nothing, holds if that
    // changes again, and means the line below can read the user it logs.
    if (user) req.user = user as NonNullable<PayloadRequest['user']>

    // One line per authenticated request, not per session: the endpoint is
    // Streamable HTTP against a stateless server, so there is no session to
    // count. See `audit.ts`.
    logMcpEvent(
      mcpAuthLogEntry({
        key: (settings as { label?: unknown }).label,
        role: user?.role,
        userId: user?.id,
      }),
    )

    return settings
  },
  // Without this the documented setup is impossible. The plugin binds a key to
  // whoever creates it and hides it from everyone else; `adminIssuableApiKeys`
  // is what lets an administrator issue an editor-bound key and revoke any key
  // afterwards. No field is added or removed, so the schema is unchanged.
  overrideApiKeyCollection: adminIssuableApiKeys,
  userCollection: 'users',
}

export const mcp = (): Plugin => mcpPlugin(mcpPluginConfig)
