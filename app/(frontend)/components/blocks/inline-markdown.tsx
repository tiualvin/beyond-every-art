import Link from 'next/link'
import type { ReactNode } from 'react'

import {
  parseInlineMarkdown,
  type InlineNode,
} from '@/lib/content/inline-markdown'
import { linkRel } from '@/lib/content/link-rel'

/**
 * A line of inline Markdown, as elements.
 *
 * Builds from the parser's nodes, never from HTML — see
 * `lib/content/inline-markdown.ts` for what is read as markup and why links
 * are limited to this site and `https:`. An editorial link carries no
 * relationship of its own, so it takes `normal`: nothing on a path on this
 * site, `noopener noreferrer` on anywhere else, and the same tab either way,
 * as a link in the body would.
 */
export function InlineMarkdown({ source }: { source: string }) {
  return <>{render(parseInlineMarkdown(source))}</>
}

function render(nodes: InlineNode[]): ReactNode[] {
  return nodes.map((node, index) => {
    switch (node.type) {
      case 'text':
        return node.text
      case 'code':
        return <code key={index}>{node.text}</code>
      case 'em':
        return <em key={index}>{render(node.children)}</em>
      case 'strong':
        return <strong key={index}>{render(node.children)}</strong>
      case 'link': {
        const internal = node.href.startsWith('/')
        const rel = linkRel('normal', { external: !internal })
        return internal ? (
          <Link key={index} href={node.href} rel={rel}>
            {render(node.children)}
          </Link>
        ) : (
          <a key={index} href={node.href} rel={rel}>
            {render(node.children)}
          </a>
        )
      }
    }
  })
}
