import type { JSXConverters } from '@payloadcms/richtext-lexical/react'

import {
  ACCORDION_BLOCK,
  PULL_QUOTE_BLOCK,
  SIGNUP_BLOCK,
  type AccordionData,
  type BlockSlug,
  type PullQuoteData,
  type SignupData,
} from '@/blocks/schema'
import { Accordion } from './accordion'
import { PullQuote } from './pull-quote'
import { Signup } from './signup'
import { UnknownNode } from './unknown'

/**
 * The one place a block slug is turned into a component.
 *
 * Typed as `Record<BlockSlug, …>` on purpose: adding a slug to `BLOCK_SLUGS`
 * without adding a renderer here is a type error rather than a block that
 * silently disappears from published articles. This is also the reason the
 * mapping is not a switch statement copied into each route.
 */
type BlockRenderers = Record<
  BlockSlug,
  (fields: Record<string, unknown>, preview: boolean) => React.ReactNode
>

const renderers: BlockRenderers = {
  [ACCORDION_BLOCK]: (fields, preview) => (
    <Accordion data={fields as AccordionData} preview={preview} />
  ),
  [PULL_QUOTE_BLOCK]: (fields) => <PullQuote data={fields as PullQuoteData} />,
  [SIGNUP_BLOCK]: (fields) => <Signup data={fields as SignupData} />,
}

type UnknownNodeShape = {
  type?: string
  fields?: { blockType?: string }
}

/**
 * Converters for a body, with this project's blocks registered.
 *
 * `preview` is threaded through rather than read from a hook because these run
 * on the server, inside an RSC render, where there is no request context to ask.
 */
export function buildConverters(preview: boolean) {
  return ({
    defaultConverters,
  }: {
    defaultConverters: JSXConverters
  }): JSXConverters => ({
    ...defaultConverters,
    blocks: Object.fromEntries(
      Object.entries(renderers).map(([slug, render]) => [
        slug,
        ({ node }: { node: { fields?: Record<string, unknown> } }) =>
          render(node.fields ?? {}, preview),
      ]),
    ),
    // Catches both unknown block slugs and node types nothing converts, which
    // is why it is registered even though every known slug is handled above.
    unknown: ({ node }: { node: UnknownNodeShape }) => (
      <UnknownNode
        nodeType={node.type ?? 'unknown'}
        blockType={node.fields?.blockType ?? null}
        preview={preview}
      />
    ),
  })
}
