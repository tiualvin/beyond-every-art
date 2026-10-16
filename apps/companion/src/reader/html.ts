// Preserved Ghost markup, reduced to what a native reader may draw.
//
// Most migrated posts render from `legacyHTML`. On the website that string goes
// into the page as it is; here it is parsed and rebuilt from an allow-list,
// and nothing else survives:
//
//   - Elements that run, load or submit something are dropped with everything
//     inside them: scripts, styles, frames, forms and their controls, media
//     players, SVG.
//   - Elements on the list keep only the attributes the renderer reads — a
//     link's href, an image's src, alt and size, a list's start. Every inline
//     style, class and event handler is gone.
//   - Anything else is unwrapped: its tag goes and its children stay, so an
//     unfamiliar wrapper cannot hide the words inside it.
//   - Links and images are resolved against the article's own URL, and keep
//     only http(s) (and mailto for a link). A `javascript:` href becomes text.
//
// The links themselves are not withheld the way rich-text links to unpublished
// posts are on the server. They do not need to be: everything a migrated post
// links to was published on Ghost before it was.

import { Parser } from 'htmlparser2'

export type HtmlText = { type: 'text'; text: string }
export type HtmlElement = {
  type: 'element'
  name: string
  attrs: Record<string, string>
  children: HtmlNode[]
}
export type HtmlNode = HtmlText | HtmlElement

/** Dropped, contents and all. */
const DROPPED = new Set([
  'audio',
  'button',
  'canvas',
  'datalist',
  'embed',
  'form',
  'frame',
  'frameset',
  'head',
  'iframe',
  'input',
  'link',
  'map',
  'math',
  'meta',
  'noscript',
  'object',
  'option',
  'script',
  'select',
  'source',
  'style',
  'svg',
  'template',
  'textarea',
  'title',
  'track',
  'video',
])

export const BLOCK_ELEMENTS = new Set([
  'article',
  'aside',
  'blockquote',
  'div',
  'figcaption',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'img',
  'li',
  'main',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
])

export const INLINE_ELEMENTS = new Set([
  'a',
  'abbr',
  'b',
  'br',
  'cite',
  'code',
  'del',
  'em',
  'i',
  'mark',
  's',
  'small',
  'span',
  'strike',
  'strong',
  'sub',
  'sup',
  'u',
])

/** The only attributes that survive, per element. */
const KEPT_ATTRIBUTES: Record<string, readonly string[]> = {
  a: ['href'],
  img: ['src', 'alt', 'width', 'height'],
  ol: ['start'],
}

function resolveUrl(
  value: string | undefined,
  base: string,
  protocols: readonly string[],
): string | null {
  if (!value?.trim()) return null
  if (value.trim().startsWith('#')) return value.trim()
  try {
    const url = new URL(value.trim(), base)
    return protocols.includes(url.protocol) ? url.toString() : null
  } catch {
    return null
  }
}

function keptAttributes(
  name: string,
  attributes: Record<string, string>,
  base: string,
): Record<string, string> | null {
  const kept: Record<string, string> = {}
  for (const key of KEPT_ATTRIBUTES[name] ?? []) {
    const value = attributes[key]
    if (value !== undefined) kept[key] = value
  }

  if (name === 'a') {
    const href = resolveUrl(kept.href, base, ['https:', 'http:', 'mailto:'])
    if (href) kept.href = href
    else delete kept.href
  }
  if (name === 'img') {
    const src = resolveUrl(kept.src, base, ['https:', 'http:'])
    // An image with nowhere safe to load from is nothing at all.
    if (!src || src.startsWith('#')) return null
    kept.src = src
  }
  return kept
}

/**
 * Parses a body into the allow-listed tree.
 *
 * `base` is the article's own URL, which is what a relative link in it meant
 * on the website.
 */
export function parseHtml(html: string, base: string): HtmlNode[] {
  const root: HtmlElement = {
    type: 'element',
    name: '#root',
    attrs: {},
    children: [],
  }
  // `null` marks an element that is unwrapped: its children go to the parent.
  const stack: (HtmlElement | null)[] = [root]
  const parentOf = () => {
    for (let at = stack.length - 1; at >= 0; at -= 1) {
      const entry = stack[at]
      if (entry) return entry
    }
    return root
  }
  let dropping = 0

  const parser = new Parser(
    {
      onopentag(name, attributes) {
        if (dropping > 0 || DROPPED.has(name)) {
          dropping += 1
          return
        }
        if (!BLOCK_ELEMENTS.has(name) && !INLINE_ELEMENTS.has(name)) {
          stack.push(null)
          return
        }
        const attrs = keptAttributes(name, attributes, base)
        if (!attrs) {
          stack.push(null)
          return
        }
        const element: HtmlElement = {
          type: 'element',
          name,
          attrs,
          children: [],
        }
        parentOf().children.push(element)
        stack.push(element)
      },
      ontext(text) {
        if (dropping > 0) return
        const siblings = parentOf().children
        const last = siblings[siblings.length - 1]
        if (last?.type === 'text') last.text += text
        else siblings.push({ type: 'text', text })
      },
      onclosetag() {
        if (dropping > 0) {
          dropping -= 1
          return
        }
        if (stack.length > 1) stack.pop()
      },
    },
    {
      decodeEntities: true,
      lowerCaseTags: true,
      lowerCaseAttributeNames: true,
    },
  )
  parser.write(html)
  parser.end()
  return root.children
}

/** Every image the body would load, for saving an article to read offline. */
export function htmlImageUrls(nodes: HtmlNode[]): string[] {
  return nodes.flatMap((node) =>
    node.type === 'element'
      ? [
          ...(node.name === 'img' && node.attrs.src ? [node.attrs.src] : []),
          ...htmlImageUrls(node.children),
        ]
      : [],
  )
}
