// Diagnostics for a body node the renderer does not know how to draw.
//
// This happens for real reasons, not just bugs: a block slug removed from the
// registry while published documents still contain it, a document restored from
// a backup taken before a rename, or a draft written against a newer deploy.
// The article must still render — a reader losing the whole piece because one
// module is unrecognised is far worse than losing the module — but the event
// has to leave a trace, or the first anyone hears of it is a reader complaint.
//
// Same shape as `lib/observability/not-found.ts`: one JSON line, never throws.

const MAX_VALUE_LENGTH = 200

export interface UnknownBlockEntry {
  level: 'warn'
  event: 'unknown_body_node'
  time: string
  /** The Lexical node type: `block`, or a node type nothing converts. */
  nodeType: string
  /** The block slug, when the node was a block. */
  blockType: string | null
}

export interface UnknownBlockInput {
  nodeType?: string | null
  blockType?: string | null
  now?: Date
}

function truncate(value: string): string {
  return value.length > MAX_VALUE_LENGTH
    ? `${value.slice(0, MAX_VALUE_LENGTH)}…`
    : value
}

export function buildUnknownBlockEntry(
  input: UnknownBlockInput,
): UnknownBlockEntry | null {
  const nodeType = (input.nodeType ?? '').trim()
  if (!nodeType) return null

  return {
    level: 'warn',
    event: 'unknown_body_node',
    time: (input.now ?? new Date()).toISOString(),
    nodeType: truncate(nodeType),
    blockType: input.blockType ? truncate(input.blockType.trim()) : null,
  }
}

/** Emit one JSON line for an unrenderable body node. Best effort. */
export function logUnknownBlock(input: UnknownBlockInput): void {
  try {
    const entry = buildUnknownBlockEntry(input)
    if (entry) console.warn(JSON.stringify(entry))
  } catch {
    // Observability is best effort.
  }
}
