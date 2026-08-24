import { randomUUID } from 'node:crypto'

/**
 * External identifier for content that did not come from Ghost.
 *
 * `ghostID` is unique on every migrated collection because it is what makes the
 * import idempotent: a rerun matches on it and updates rather than duplicating.
 * Content authored here has no Ghost record to match, but it still benefits
 * from carrying a durable external identifier — so it gets a synthetic one.
 *
 * The `native:` prefix does two jobs. It cannot collide with a Ghost ObjectID,
 * which is 24 hex characters, so an autofilled value can never be mistaken for
 * a real one by `pnpm migrate:validate` (which keys on the IDs the export
 * actually contains). And it makes natively authored content greppable, which
 * is what the eventual "is this field still earning its place?" conversation
 * will need.
 *
 * Lives here rather than beside the MCP tool that first needed it: the field
 * itself autofills now, so this is the collection's behaviour and not one
 * client's workaround.
 */
export function nativeGhostID(): string {
  return `native:${randomUUID()}`
}
