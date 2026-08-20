// What the consent screen may offer, derived rather than restated.
//
// The capability grid a person ticks on the consent page has to match the one
// the MCP plugin actually enforces. Writing it out twice would mean that adding
// `pages` to the allowlist one day, and forgetting this file, produces a
// consent screen that understates what a connector can reach — the exact
// failure the plugin's own allowlist exists to prevent. So it is read off
// `mcpPluginConfig` and `mcpTools`, and adding a collection there adds a row
// here with no second edit.

import { mcpPluginConfig } from '../mcp/plugin'
import { mcpTools } from '../mcp/tools'

export type CapabilityRow = {
  /** Field name on the API-key document, e.g. `posts`. */
  group: string
  /** Operations the plugin has enabled for it, e.g. `['create','find']`. */
  operations: string[]
}

/** The field name the plugin gives the custom-tool checkbox group. */
export const TOOL_GROUP = 'payload-mcp-tool'

/**
 * Collection rows, in the order the plugin declares them.
 *
 * Only operations the plugin enabled appear: a capability the config does not
 * allow has no checkbox on the API-key document either, so offering it would
 * write a field that does not exist.
 */
export function collectionCapabilities(
  config = mcpPluginConfig,
): CapabilityRow[] {
  return Object.entries(config.collections ?? {}).map(([slug, entry]) => {
    const enabled = (entry as { enabled?: unknown } | undefined)?.enabled
    const operations =
      enabled === true
        ? ['create', 'delete', 'find', 'update']
        : typeof enabled === 'object' && enabled !== null
          ? Object.entries(enabled as Record<string, unknown>)
              .filter(([, on]) => on === true)
              .map(([operation]) => operation)
          : []

    return { group: slug, operations }
  })
}

/** Custom tool names, which are individually grantable. */
export function toolCapabilities(tools = mcpTools): string[] {
  return tools.map((tool) => tool.name)
}

/**
 * The capability document a consent submission produces.
 *
 * Anything the form did not tick is written as `false` rather than omitted, so
 * the record says what was refused instead of leaving it to a default — and the
 * plugin's custom-tool checkboxes default to *true*, which would otherwise
 * grant every drafting tool to a connector whose approver ticked none of them.
 */
export function capabilityDocument(
  granted: ReadonlySet<string>,
  config = mcpPluginConfig,
  tools = mcpTools,
): Record<string, Record<string, boolean>> {
  const document: Record<string, Record<string, boolean>> = {}

  for (const { group, operations } of collectionCapabilities(config)) {
    document[group] = Object.fromEntries(
      operations.map((operation) => [
        operation,
        granted.has(`${group}.${operation}`),
      ]),
    )
  }

  document[TOOL_GROUP] = Object.fromEntries(
    toolCapabilities(tools).map((name) => [name, granted.has(`tool.${name}`)]),
  )

  return document
}
