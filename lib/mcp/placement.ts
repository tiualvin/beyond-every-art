// Where a module goes in a body, for the tools that write one.
//
// Shared by `setKeyFactsBlock` and `setFAQBlock`, which place their modules by
// the same rules — see `key-facts.ts` for why those rules are what they are.
// Kept in one place so the two tools cannot drift into answering "which
// heading?" or "which of the two?" differently, and so an agent that has
// learned one tool's refusals has learned the other's.

import { randomBytes } from 'node:crypto'

import { headingText } from '../content/headings'
import { indexBlocks, textOf, type BlockNode, type LexicalNode } from './blocks'
import type { EditorState } from './markdown'

/**
 * A fresh id, in the shape Payload gives its own blocks and array rows: 24 hex
 * digits. Letters and digits only, which is what lets it be a marker key.
 */
export function objectId(): string {
  return randomBytes(12).toString('hex')
}

export function quoteList(values: string[]): string {
  return values.map((value) => `"${value}"`).join(', ')
}

/** Heading text as a person would compare it: case and spacing ignored. */
function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase()
}

/** A copy of the body's top-level nodes, safe to splice. */
export function bodyChildren(
  state: EditorState | null | undefined,
): LexicalNode[] {
  return [...(state?.root?.children ?? [])] as LexicalNode[]
}

/** `state` with its top-level nodes replaced, and everything else kept. */
export function withChildren(
  state: EditorState | null | undefined,
  children: LexicalNode[],
): EditorState {
  return {
    ...(state ?? {}),
    root: {
      type: 'root',
      version: 1,
      format: '',
      indent: 0,
      direction: 'ltr',
      ...(state?.root ?? {}),
      children,
    },
  } as EditorState
}

/**
 * The body's one module of `blockType`, if it has one.
 *
 * Refuses when it has more than one: which was meant is a guess, and the
 * markers in `readArticleMarkdown` already give the agent a way to remove the
 * extras and ask again. `plural` names the module in that refusal.
 */
export function singleExisting(
  state: EditorState | null | undefined,
  blockType: string,
  plural: string,
) {
  const existing = indexBlocks(state).filter(
    ({ node }) => node.fields.blockType === blockType,
  )

  if (existing.length > 1) {
    const where = existing.map(({ afterHeading }) => afterHeading ?? '(top)')
    throw new Error(
      `This article has ${existing.length} ${plural}, under ` +
        `${quoteList(where)}, and it is not clear which to replace. Remove ` +
        'all but one with updateArticleMarkdown — leave their marker lines ' +
        'out — then call this again.',
    )
  }

  return existing[0]
}

/**
 * The key an existing module keeps when it is replaced.
 *
 * Kept, so a marker the agent already holds still names the module. An id
 * that cannot be a marker is replaced with one that can.
 */
export function keptKey(node: BlockNode): string {
  const id = node.fields.id ?? ''
  return /^[A-Za-z0-9]+$/.test(id) ? id : objectId()
}

export type HeadingMatch = {
  /** Position among the body's top-level nodes. */
  index: number
  text: string
  /** 1 for `h1` through 6 for `h6`. */
  level: number
}

/**
 * The one top-level heading reading `wanted`, compared ignoring case and
 * spacing — or a refusal that lists the headings there are.
 *
 * `none` says what the article does not have yet and `placed` what is being
 * placed, with its verb, so each tool's refusal reads in its own terms: "This
 * article has no key facts yet, so say where the facts go".
 */
export function findHeading(
  children: LexicalNode[],
  wanted: string | undefined,
  words: { none: string; placed: string },
): HeadingMatch {
  const headings = children.flatMap((node, index) =>
    node.type === 'heading'
      ? [
          {
            index,
            text: headingText(node),
            level: Number(String(node.tag ?? 'h2').slice(1)) || 2,
          },
        ]
      : [],
  )

  if (!wanted?.trim()) {
    throw new Error(
      `This article has no ${words.none} yet, so say where ${words.placed}: ` +
        'pass afterHeading with the text of a heading in the body. ' +
        (headings.length
          ? `Its headings are ${quoteList(headings.map((h) => h.text))}.`
          : 'The body has no headings; add one with updateArticleMarkdown first.'),
    )
  }

  const matches = headings.filter(
    (h) => normalise(h.text) === normalise(wanted),
  )

  if (matches.length === 0) {
    throw new Error(
      `No heading in the body reads "${wanted.trim()}". ` +
        (headings.length
          ? `Its headings are ${quoteList(headings.map((h) => h.text))}.`
          : 'The body has no headings.'),
    )
  }
  if (matches.length > 1) {
    throw new Error(
      `"${matches[0].text}" heads ${matches.length} sections, so it does not ` +
        `say which one ${words.placed} under. Rename one with ` +
        'updateArticleMarkdown first.',
    )
  }

  return matches[0]
}

/** A block node as the editor writes one. */
export function blockNode(fields: BlockNode['fields']): LexicalNode {
  return { type: 'block', version: 2, format: '', fields } as LexicalNode
}

/**
 * A Markdown table as the body stores one: a single paragraph of pipe-bounded
 * lines, because the editor has no table feature to convert it into.
 */
export function isPipeTable(node: LexicalNode | undefined): boolean {
  if (node?.type !== 'paragraph') return false
  const text = textOf(node).trim()
  return text.startsWith('|') && text.endsWith('|')
}

/**
 * Where the section under the heading at `index` ends: the next heading of
 * the same or higher level, or the end of the body. A deeper heading — a
 * `###` inside a `##` section — is part of the section.
 */
export function sectionEnd(
  children: LexicalNode[],
  index: number,
  level: number,
): number {
  let end = index + 1
  while (
    end < children.length &&
    !(
      children[end].type === 'heading' &&
      (Number(String(children[end].tag ?? 'h2').slice(1)) || 2) <= level
    )
  ) {
    end += 1
  }
  return end
}
