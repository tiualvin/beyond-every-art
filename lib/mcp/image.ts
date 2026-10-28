// Placing an existing image in an article's body, under a named heading.
//
// Until this, the only way an agent could illustrate an article was a
// featured image: `uploadMediaFromUrl` returned an id for `updatePosts` to set
// as `featuredImage`, and the body had no image anywhere. This writes the same
// upload node the editor's image button writes, so the page renders it as a
// figure with its caption and credit (`components/body-image.tsx`) and
// describes it to search engines like any other body image.
//
// The rules, in the order they are applied:
//
// - The image goes directly under the named heading. Headings are the address
//   an agent and an editor both see, and the one that survives a revision —
//   the reason `setKeyFactsBlock` places by them too.
// - If that heading is already directly followed by this same image, it is
//   updated where it stands rather than placed twice. That makes a retried
//   call safe: a caption corrected by calling again changes the caption, not
//   the number of pictures.
// - Caption and credit belong to this placement and override the image's own
//   for this article only. Left out, the figure shows the Media record's — so
//   a correction to the record's credit reaches every article that did not
//   say otherwise.
//
// Every other node is passed through as the same object.

import { headingText } from '../content/headings'
import type { LexicalNode } from './blocks'
import type { EditorState } from './markdown'
import { bodyChildren, findHeading, objectId, withChildren } from './placement'

export type PlaceImageInput = {
  mediaId: number | string
  afterHeading: string
  caption?: string
  credit?: string
}

export type PlaceImageResult = {
  state: EditorState
  placement: 'inserted' | 'updated'
  /** The heading the image now sits directly under. */
  afterHeading: string
  /** The upload node's own id: what keeps its caption through a revision. */
  nodeId: string
}

/** The longest caption accepted, matching the length a figcaption reads at. */
export const IMAGE_CAPTION_MAX = 300
/** The longest credit accepted: a name and a source, not a paragraph. */
export const IMAGE_CREDIT_MAX = 160

function trimmed(
  value: string | undefined,
  max: number,
  what: string,
): string | undefined {
  const text = value?.replace(/\s+/g, ' ').trim()
  if (!text) return undefined
  if (text.length > max) {
    throw new Error(
      `The ${what} is ${text.length} characters; keep it to ${max}. A ` +
        `${what} is read under a picture, not as a paragraph.`,
    )
  }
  return text
}

/** Whether `node` is an upload of the Media record `mediaId`. */
function isUploadOf(node: LexicalNode | undefined, mediaId: string): boolean {
  if (node?.type !== 'upload' || node.relationTo !== 'media') return false
  const value = node.value as { id?: unknown } | string | number | null
  const id = typeof value === 'object' && value !== null ? value.id : value
  return String(id) === mediaId
}

export function placeImage(
  state: EditorState | null | undefined,
  input: PlaceImageInput,
): PlaceImageResult {
  const mediaId = String(input.mediaId).trim()
  if (!mediaId) throw new Error('Give the id of the image to place.')

  const caption = trimmed(input.caption, IMAGE_CAPTION_MAX, 'caption')
  const credit = trimmed(input.credit, IMAGE_CREDIT_MAX, 'credit')
  const fields = {
    ...(caption ? { caption } : {}),
    ...(credit ? { credit } : {}),
  }

  const children = bodyChildren(state)
  const { index, text } = findHeading(children, input.afterHeading, {
    none: 'image in this place',
    placed: 'the image goes',
  })
  const at = index + 1

  const existing = children[at]
  if (isUploadOf(existing, mediaId)) {
    const nodeId =
      typeof existing.id === 'string' && existing.id ? existing.id : objectId()
    children[at] = { ...existing, id: nodeId, fields } as LexicalNode
    return {
      state: withChildren(state, children),
      placement: 'updated',
      afterHeading: text,
      nodeId,
    }
  }

  const nodeId = objectId()
  children.splice(at, 0, {
    type: 'upload',
    version: 3,
    format: '',
    id: nodeId,
    relationTo: 'media',
    // A number where the id is one, as the editor stores it: Postgres ids
    // are integers, and a string here would populate but compare unequal.
    value: /^\d+$/.test(mediaId) ? Number(mediaId) : mediaId,
    fields,
  } as LexicalNode)

  return {
    state: withChildren(state, children),
    placement: 'inserted',
    afterHeading: text,
    nodeId,
  }
}

/** An image in a body, as the read tools report it beside the Markdown. */
export type ImageSummary = {
  /** The line that stands for it in the Markdown. */
  markdown: string
  mediaId: string
  /** The nearest heading above it, or null when it precedes them all. */
  afterHeading: string | null
  /** This placement's own caption and credit; null where it uses the image's. */
  caption: string | null
  credit: string | null
}

/**
 * Every Media image in a body, in reading order, with what this placement
 * says for itself.
 *
 * Reported beside the Markdown because an image's Markdown form is the bare
 * `![media:id]()`, and bodies are elided from every other MCP response: without
 * this an agent revising a draft could not see that an image had a caption at
 * all. Top level only, where the editor and `placeImage` put them.
 */
export function listImages(
  state: EditorState | null | undefined,
): ImageSummary[] {
  const images: ImageSummary[] = []
  let afterHeading: string | null = null
  for (const node of bodyChildren(state)) {
    if (node.type === 'heading') {
      afterHeading = headingText(node) || afterHeading
      continue
    }
    if (node.type !== 'upload' || node.relationTo !== 'media') continue
    const value = node.value as { id?: unknown } | string | number | null
    const id = typeof value === 'object' && value !== null ? value.id : value
    if (id === undefined || id === null) continue
    const fields = (node.fields ?? {}) as Record<string, unknown>
    const own = (key: string) =>
      typeof fields[key] === 'string' && (fields[key] as string).trim()
        ? (fields[key] as string).trim()
        : null
    images.push({
      markdown: `![media:${String(id)}]()`,
      mediaId: String(id),
      afterHeading,
      caption: own('caption'),
      credit: own('credit'),
    })
  }
  return images
}
