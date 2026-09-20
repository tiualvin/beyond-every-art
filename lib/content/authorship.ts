// Whether the last change to a document was made by a person or by an agent.
//
// This project runs an MCP server so Claude and Codex can draft articles, which
// is a real editorial workflow and not a novelty. What it did not have was a
// way to tell afterwards. `lib/mcp/audit.ts` opens by naming the gap exactly:
// Payload's version history records what changed and when, not who, and with
// autosave running at 800ms an agent's edits are indistinguishable from a
// person's. The audit line closes it for whoever reads
// `docker compose logs app`; it closes nothing for the editor sitting in the
// admin panel deciding what still needs reading.
//
// So the same fact is recorded on the document. One field, not two: "when did
// an agent last touch this" is a worse question than "who touched it last",
// because a person opening an agent's draft and fixing it is the event that
// matters, and only the second question notices it.
//
// It is bookkeeping, not editorial state — an agent draft is not lesser work,
// and nothing here gates publishing on it. `refuseMcpPublish` already decides
// what an agent may publish; this decides nothing at all.

import type { CollectionBeforeChangeHook } from 'payload'
import type { Field } from 'payload'

import { editorsAndAdminsField } from '../../access/roles'

export const EDITOR_KINDS = ['person', 'agent'] as const

export type EditorKind = (typeof EDITOR_KINDS)[number]

/**
 * Stamps who is making this write.
 *
 * `req.payloadAPI` is what `recordMcpWrite` already keys on, so the two agree
 * by construction rather than by two separate guesses at the same question.
 *
 * Runs on every write including autosave, which is the point: an agent drafts,
 * a person opens it and types one character, and the flag turns over at the
 * moment that becomes true.
 */
export const stampLastEditedBy: CollectionBeforeChangeHook = ({
  data,
  req,
}) => {
  const kind: EditorKind = req.payloadAPI === 'MCP' ? 'agent' : 'person'
  return { ...data, lastEditedBy: kind }
}

/**
 * The field the hook writes.
 *
 * Read-gated to staff for the same reason the Ghost bookkeeping is: it is
 * internal process, nothing renders it, and `GET /api/posts` has no reason to
 * tell an anonymous caller which articles a machine wrote.
 */
export function lastEditedByField(): Field {
  return {
    name: 'lastEditedBy',
    label: 'Last edited by',
    type: 'select',
    index: true,
    options: [
      { label: 'A person', value: 'person' },
      { label: 'An agent', value: 'agent' },
    ],
    access: { read: editorsAndAdminsField },
    admin: {
      readOnly: true,
      position: 'sidebar',
      description:
        'Set automatically. “An agent” means the most recent change came through the MCP server rather than this panel.',
    },
  }
}
