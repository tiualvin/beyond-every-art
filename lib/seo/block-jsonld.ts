// What each block contributes to a page's structured data.
//
// The third contract a block has, alongside the React renderer in
// `app/(frontend)/components/blocks/registry.tsx` and the plain-text serializer
// in `lib/content/plain-text.ts`. Before this existed a block could not
// describe itself to a search engine at all: the page's JSON-LD was built from
// the post's own fields and never looked at the body, so an article containing
// six questions and their answers was, to a crawler, an Article and nothing
// more.
//
// Typed as `Record<BlockSlug, …>` for the same reason the other two are. A new
// block slug is a type error here until somebody decides what it means to a
// crawler, and "nothing" is a legitimate and common answer — most modules are
// presentation, and inventing a type for one is worse than staying quiet.

import {
  ACCORDION_BLOCK,
  BOOKMARK_BLOCK,
  BUTTON_BLOCK,
  CALLOUT_BLOCK,
  COMPARISON_TABLE_BLOCK,
  EMBED_BLOCK,
  FAQ_BLOCK,
  FEATURE_LIST_BLOCK,
  GALLERY_BLOCK,
  KEY_TAKEAWAYS_BLOCK,
  MEDIA_TEXT_BLOCK,
  PAYWALL_BLOCK,
  PULL_QUOTE_BLOCK,
  SIGNUP_BLOCK,
  type BlockSlug,
  type FaqData,
  type FeatureListData,
} from '../../blocks/schema'
import type { ArticleBody, BodyNode } from '../content/body'
import { richTextToPlainText } from '../content/plain-text'

/** One `@type`-bearing object, ready to be merged into a page's graph. */
export type JsonLdNode = Record<string, unknown>

const NOTHING = (): JsonLdNode[] => []

const blockJsonLd: Record<BlockSlug, (fields: unknown) => JsonLdNode[]> = {
  // Presentation, all of them. A dropdown is a way of showing text and a pull
  // quote is a typographic device; neither is a claim about what the content
  // is, and `Quotation` on a pulled sentence describes the article's own words
  // back to itself. A gallery's images are described by the Article's `image`,
  // and the licensing metadata that would justify `ImageObject` per plate is
  // not on the block yet.
  [ACCORDION_BLOCK]: NOTHING,
  [PULL_QUOTE_BLOCK]: NOTHING,
  [CALLOUT_BLOCK]: NOTHING,
  [BUTTON_BLOCK]: NOTHING,
  [GALLERY_BLOCK]: NOTHING,
  [BOOKMARK_BLOCK]: NOTHING,
  [KEY_TAKEAWAYS_BLOCK]: NOTHING,
  [MEDIA_TEXT_BLOCK]: NOTHING,

  // schema.org has `Table`, and it says only "this region is a table" — which
  // the `<table>` element already said, to every consumer, more reliably. The
  // structured-data win for a table is the markup, not a node describing it.
  [COMPARISON_TABLE_BLOCK]: NOTHING,

  // Form chrome and an editorial marker. Neither is content.
  [SIGNUP_BLOCK]: NOTHING,
  [PAYWALL_BLOCK]: NOTHING,

  // A video needs `thumbnailUrl` and `uploadDate` to be worth describing, and
  // the block stores neither — a `VideoObject` missing its required properties
  // is an invalid node, which is worse than no node. Revisit when the embed
  // block carries them.
  [EMBED_BLOCK]: NOTHING,

  /**
   * Questions and their answers.
   *
   * Google restricted FAQ *rich results* to authoritative government and
   * health sites in 2023, so this will not draw a SERP accordion for a
   * publication like this one. It is emitted anyway because the rich result
   * was never the only consumer: Bing still uses it, and answer engines read
   * it to decide what an article definitively says. It costs a few hundred
   * bytes and it is the honest description of the content.
   */
  [FAQ_BLOCK]: (fields) => {
    const data = (fields ?? {}) as FaqData

    const questions = (data.items ?? []).flatMap((item) => {
      const name = item?.question?.trim()
      const text = richTextToPlainText(item?.answer)
      // A question with no answer text is not a Question a crawler can use,
      // and an `acceptedAnswer` with an empty body is an invalid node. Both
      // halves have to be there or the entry is dropped.
      if (!name || !text) return []
      return [
        {
          '@type': 'Question',
          name,
          acceptedAnswer: { '@type': 'Answer', text },
        },
      ]
    })

    if (questions.length === 0) return []
    return [{ '@type': 'FAQPage', mainEntity: questions } satisfies JsonLdNode]
  },

  /**
   * An ordered list of things.
   *
   * `ItemList` rather than `HowTo`: Google retired HowTo rich results, and the
   * block does not know whether its items are steps in a process or six
   * pigments — only the editor does, and `numbered` is a presentation switch,
   * not a promise that the order is procedural. `ItemList` is true either way.
   */
  [FEATURE_LIST_BLOCK]: (fields) => {
    const data = (fields ?? {}) as FeatureListData

    // Positions count the items that survive, not their stored index. An
    // untitled row is dropped — it is what a half-filled draft looks like —
    // and numbering from the stored index would leave the list starting at 2,
    // or with a hole in the middle. `ItemList` positions have to run 1..n.
    const elements = (data.items ?? [])
      .flatMap((item) => {
        const name = item?.title?.trim()
        if (!name) return []
        const description = item?.body?.trim()
        return [{ name, ...(description ? { description } : {}) }]
      })
      .map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        ...item,
      }))

    if (elements.length === 0) return []

    const name = data.heading?.trim()
    return [
      {
        '@type': 'ItemList',
        ...(name ? { name } : {}),
        itemListElement: elements,
      } satisfies JsonLdNode,
    ]
  },
}

function isBlockSlug(value: unknown): value is BlockSlug {
  return typeof value === 'string' && value in blockJsonLd
}

/** Every block in a node tree, depth first, in reading order. */
function walk(nodes: BodyNode[], into: JsonLdNode[]): void {
  for (const node of nodes) {
    if (node.type === 'block') {
      const slug = node.fields?.blockType
      if (isBlockSlug(slug)) into.push(...blockJsonLd[slug](node.fields))
    }
    if (node.children?.length) walk(node.children, into)
  }
}

/**
 * The structured-data nodes the blocks in a body contribute.
 *
 * Takes the already-built `ArticleBody` rather than the raw document, which
 * means a gated post contributes only what its teaser actually contains: the
 * withheld part has been dropped by `toArticleBody` before this sees it.
 * Describing content to a crawler that a reader is not served is the
 * definition of cloaking, and taking the same input as the renderer is what
 * makes that impossible here rather than merely unintended.
 */
export function collectBlockJsonLd(body: ArticleBody): JsonLdNode[] {
  // Preserved Ghost markup is an HTML string with no blocks in it, and an
  // empty body has nothing at all.
  if (body.kind !== 'lexical') return []

  const collected: JsonLdNode[] = []
  walk(body.content.root?.children ?? [], collected)
  return collected
}
