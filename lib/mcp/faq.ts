// Setting an article's FAQ without touching the rest of its body.
//
// Placed by the same rules as key facts — see `key-facts.ts` for why, and
// `placement.ts` for the shared code — with two differences that come from the
// block itself.
//
// An FAQ always shows a heading of its own, at the same level as the body's
// section headings. Inserted directly under a body heading such as "## FAQ",
// that stacks two headings in a row. So `replaceExisting` offers the other
// placement, and the one an FAQ written in Markdown wants: the block takes the
// place of that heading's whole section — the heading and everything under it,
// up to the next heading of the same or higher level — and inherits the
// heading's text, so the page outline and the section's `#faq` link are what
// they were.
//
// And an FAQ's heading is never absent; an unheaded one shows "Frequently
// asked questions". So where key facts treat a heading left out as a heading
// removed, an existing FAQ keeps the heading it has. Resetting it to the
// default on every edit would change the section's anchor under whoever had
// linked to it.
//
// Answers arrive as Markdown and are converted by the caller, against the
// answer field's own editor — see `markdownToBlockRichText`. This module stays
// free of Payload.

import {
  FAQ_BLOCK,
  FAQ_DEFAULT_HEADING,
  type FaqItem,
} from '../../blocks/schema'
import { isEmptyRichText } from '../content/richtext'
import { headingText } from '../content/headings'
import {
  blockMarker,
  isBlockNode,
  type BlockNode,
  type LexicalNode,
} from './blocks'
import type { EditorState } from './markdown'
import {
  blockNode,
  bodyChildren,
  findHeading,
  keptKey,
  objectId,
  singleExisting,
  withChildren,
} from './placement'

export type FaqInputItem = { question: string; answer: string }

export type FaqInput = {
  items: FaqInputItem[]
  heading?: string
  afterHeading?: string
  replaceExisting?: boolean
}

export type FaqResult = {
  state: EditorState
  placement: 'inserted' | 'replaced'
  key: string
  marker: string
  /** The heading the FAQ now shows. */
  heading: string
  /** The body heading above the FAQ, or null when it precedes them all. */
  afterHeading: string | null
  /** The body section the FAQ took the place of, by its heading, if any. */
  replacedSection: string | null
}

/** Markdown to an answer's editor state; supplied by the caller. */
export type ConvertAnswer = (markdown: string) => EditorState

function headingLevel(node: LexicalNode): number {
  return Number(String(node.tag ?? 'h2').slice(1)) || 2
}

/**
 * The questions as the block stores them, or a refusal naming the first
 * problem.
 *
 * Checked here as well as by the tool's schema: a draft save skips Payload's
 * own field validation, so a blank answer would be stored, and would only be
 * refused later — at publish, in front of an editor.
 */
function toItems(
  items: FaqInputItem[] | undefined,
  convert: ConvertAnswer,
): FaqItem[] {
  if (!items?.length) throw new Error('Give at least one question.')

  return items.map((item, index) => {
    const question = item.question?.trim()
    const markdown = item.answer?.trim()
    if (!question || !markdown) {
      throw new Error(
        `Question ${index + 1} has no ${question ? 'answer' : 'question'}. ` +
          'Every entry needs both.',
      )
    }

    const answer = convert(markdown)
    if (isEmptyRichText(answer)) {
      throw new Error(`The answer to "${question}" has no text in it.`)
    }
    // Each question is itself a heading on the page. A heading inside its
    // answer would sit in the outline beneath it, and inside a panel a reader
    // may never open.
    if (answer.root.children.some((node) => node.type === 'heading')) {
      throw new Error(
        `The answer to "${question}" contains a heading. An answer is a ` +
          'paragraph or two; use bold text for emphasis instead.',
      )
    }

    return { id: objectId(), question, answer }
  })
}

/** What replacing a section would delete that is not text. */
function describeLoss(nodes: LexicalNode[]): string | null {
  const lost = nodes.flatMap((node) => {
    if (isBlockNode(node)) return [`a ${node.fields.blockType} module`]
    if (node.type === 'upload') return ['an image']
    if (node.type === 'relationship') return ['a link card']
    return []
  })
  return lost.length ? lost.join(', ') : null
}

export function setFaq(
  state: EditorState | null | undefined,
  input: FaqInput,
  convert: ConvertAnswer,
): FaqResult {
  const items = toItems(input.items, convert)
  const asked = input.heading?.trim()
  const children = bodyChildren(state)
  const existing = singleExisting(state, FAQ_BLOCK, 'FAQ modules')

  const fieldsFor = (
    id: string,
    heading: string,
    blockName = '',
  ): BlockNode['fields'] => ({
    id,
    blockName,
    blockType: FAQ_BLOCK,
    heading,
    items,
  })

  if (existing) {
    const { index, node, afterHeading } = existing
    const key = keptKey(node)
    const kept = String(node.fields.heading ?? '').trim()
    const heading = asked || kept || FAQ_DEFAULT_HEADING
    children[index] = {
      ...node,
      fields: fieldsFor(key, heading, node.fields.blockName ?? ''),
    } as LexicalNode

    return {
      state: withChildren(state, children),
      placement: 'replaced',
      key,
      marker: blockMarker(FAQ_BLOCK, key),
      heading,
      afterHeading,
      replacedSection: null,
    }
  }

  const match = findHeading(children, input.afterHeading, {
    none: 'FAQ',
    placed: 'the FAQ goes',
  })
  const key = objectId()

  if (!input.replaceExisting) {
    const heading = asked || FAQ_DEFAULT_HEADING
    children.splice(match.index + 1, 0, blockNode(fieldsFor(key, heading)))

    return {
      state: withChildren(state, children),
      placement: 'inserted',
      key,
      marker: blockMarker(FAQ_BLOCK, key),
      heading,
      afterHeading: match.text,
      replacedSection: null,
    }
  }

  // The section runs to the next heading of the same or higher level, so a
  // question written as its own `###` heading is part of it.
  let end = match.index + 1
  while (
    end < children.length &&
    !(
      children[end].type === 'heading' &&
      headingLevel(children[end]) <= match.level
    )
  ) {
    end += 1
  }

  // A section heading inside the section means the named heading is above
  // the article's sections rather than one of them — an `h1`, say — and the
  // "section" is most of the article. Questions written as their own
  // headings sit a level down, as `###`, and are fine.
  const swallowed = children
    .slice(match.index + 1, end)
    .filter((node) => node.type === 'heading' && headingLevel(node) <= 2)
    .map((node) => headingText(node))
  if (swallowed.length) {
    throw new Error(
      `The section under "${match.text}" contains the sections ` +
        `${swallowed.map((text) => `"${text}"`).join(', ')}, which replacing ` +
        'it would delete, so nothing was changed. Name the heading directly ' +
        'above the questions.',
    )
  }

  const loss = describeLoss(children.slice(match.index + 1, end))
  if (loss) {
    throw new Error(
      `The section under "${match.text}" holds ${loss}, which replacing it ` +
        'would delete, so nothing was changed. Move it out of the section ' +
        'with updateArticleMarkdown first, or call again without ' +
        'replaceExisting to insert the FAQ under the heading.',
    )
  }

  const heading = asked || match.text
  children.splice(
    match.index,
    end - match.index,
    blockNode(fieldsFor(key, heading)),
  )

  const above = children
    .slice(0, match.index)
    .filter((node) => node.type === 'heading')
    .at(-1)

  return {
    state: withChildren(state, children),
    placement: 'inserted',
    key,
    marker: blockMarker(FAQ_BLOCK, key),
    heading,
    afterHeading: above ? headingText(above) : null,
    replacedSection: match.text,
  }
}
