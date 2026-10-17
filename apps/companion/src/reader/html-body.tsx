// The allow-listed HTML tree, drawn with native views.
//
// HTML mixes words and blocks freely — a list item holds text and then a list,
// a paragraph sometimes holds an image — and React Native does not: text lives
// in Text, and a block cannot sit inside one. So every container is drawn as a
// sequence of runs: consecutive inline content becomes one Text, and each
// block element breaks the run and draws itself. Whitespace collapses the way
// a browser collapses it, except inside `pre`.

import { useMemo } from 'react'
import { Image } from 'expo-image'
import { StyleSheet, Text, View, type TextStyle } from 'react-native'

import { familyFor } from '../theme/fonts'
import { Txt } from '../theme/text'
import { useTheme } from '../theme/theme'
import { space, type, type TypeVariant } from '../theme/typography'
import {
  BLOCK_ELEMENTS,
  parseHtml,
  type HtmlElement,
  type HtmlNode,
} from './html'
import { useOpenLink } from './link-context'
import { QuoteFrame, quoteText, useInQuote } from './quote'

type InlineStyle = {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  code: boolean
  small: boolean
}

const PLAIN: InlineStyle = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  code: false,
  small: false,
}

/** Where a quotation's text starts: italic, before any markup inside it. */
const QUOTED: InlineStyle = { ...PLAIN, italic: true }

const HEADINGS: Record<string, TypeVariant> = {
  h1: 'title',
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  h5: 'h5',
  h6: 'h6',
}

const isBlock = (node: HtmlNode) =>
  node.type === 'element' && BLOCK_ELEMENTS.has(node.name)

export function HtmlBody({ html, base }: { html: string; base: string }) {
  const nodes = useMemo(() => parseHtml(html, base), [html, base])
  return <Children nodes={nodes} />
}

/** A container's children, as runs of inline content between blocks. */
function Children({
  nodes,
  variant,
  spaced = true,
}: {
  nodes: HtmlNode[]
  /** Defaults to body text, or to the quotation's style inside one. */
  variant?: TypeVariant
  /** Paragraph spacing after each run; off inside list items and table cells. */
  spaced?: boolean
}) {
  // Ghost wraps a quotation's text in paragraphs, so the quotation's style has
  // to reach runs drawn several elements further down.
  const quoted = useInQuote()
  const parts: React.ReactNode[] = []
  let run: HtmlNode[] = []

  const flush = () => {
    if (run.some((node) => !(node.type === 'text' && !node.text.trim()))) {
      parts.push(
        <Txt
          key={`run-${parts.length}`}
          variant={variant ?? (quoted ? 'quote' : 'body')}
          style={[
            spaced && !quoted ? styles.paragraph : undefined,
            quoted ? quoteText : undefined,
          ]}
        >
          <InlineRun
            nodes={trimRun(run)}
            inherited={quoted ? QUOTED : PLAIN}
            face={quoted ? 'serif' : 'sans'}
          />
        </Txt>,
      )
    }
    run = []
  }

  nodes.forEach((node) => {
    if (isBlock(node)) {
      flush()
      parts.push(
        <BlockElement
          key={`block-${parts.length}`}
          element={node as HtmlElement}
        />,
      )
    } else {
      run.push(node)
    }
  })
  flush()
  return <>{parts}</>
}

/** Leading and trailing whitespace of a run is not content. */
function trimRun(nodes: HtmlNode[]): HtmlNode[] {
  const copy = [...nodes]
  const first = copy[0]
  if (first?.type === 'text')
    copy[0] = { ...first, text: first.text.replace(/^\s+/, '') }
  const last = copy[copy.length - 1]
  if (last?.type === 'text') {
    copy[copy.length - 1] = { ...last, text: last.text.replace(/\s+$/, '') }
  }
  return copy
}

function BlockElement({ element }: { element: HtmlElement }) {
  const { palette } = useTheme()

  switch (element.name) {
    case 'p':
      return <Children nodes={element.children} />
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return (
        <Txt
          variant={HEADINGS[element.name]}
          accessibilityRole="header"
          style={styles.heading}
        >
          <InlineRun
            nodes={trimRun(element.children)}
            inherited={PLAIN}
            face={['h5', 'h6'].includes(element.name) ? 'sans' : 'serif'}
          />
        </Txt>
      )
    case 'ul':
    case 'ol':
      return <List element={element} />
    case 'li':
      // A stray item outside a list: its content, without a marker.
      return <Children nodes={element.children} />
    case 'blockquote':
      return (
        <QuoteFrame>
          <Children nodes={element.children} />
        </QuoteFrame>
      )
    case 'figure':
      return (
        <View style={styles.figure}>
          <Children nodes={element.children} />
        </View>
      )
    case 'figcaption':
      return (
        <Txt variant="meta" tone="muted" style={styles.caption}>
          <InlineRun nodes={trimRun(element.children)} inherited={PLAIN} />
        </Txt>
      )
    case 'img':
      return <HtmlImage element={element} />
    case 'hr':
      return (
        <View
          style={[styles.rule, { backgroundColor: palette.rule }]}
          accessible={false}
          importantForAccessibility="no"
        />
      )
    case 'pre':
      return (
        <View style={[styles.pre, { backgroundColor: palette.line }]}>
          <Txt variant="code">{textOf(element)}</Txt>
        </View>
      )
    case 'table':
    case 'thead':
    case 'tbody':
    case 'tfoot':
      return (
        <View style={element.name === 'table' ? styles.table : undefined}>
          <Children nodes={element.children} />
        </View>
      )
    case 'tr':
      return (
        <View style={[styles.tableRow, { borderColor: palette.rule }]}>
          {element.children
            .filter((child): child is HtmlElement => child.type === 'element')
            .map((cell, index) => (
              <View key={index} style={styles.tableCell}>
                <Children
                  nodes={cell.children}
                  variant={cell.name === 'th' ? 'label' : 'body'}
                  spaced={false}
                />
              </View>
            ))}
        </View>
      )
    default:
      // div, section, article, header, footer, aside, main, td, th: containers.
      return <Children nodes={element.children} />
  }
}

function List({ element }: { element: HtmlElement }) {
  const ordered = element.name === 'ol'
  const start = Number.parseInt(element.attrs.start ?? '1', 10)
  const items = element.children.filter(
    (child): child is HtmlElement =>
      child.type === 'element' && child.name === 'li',
  )
  return (
    <View style={styles.list}>
      {items.map((item, index) => (
        <View key={index} style={styles.item}>
          <Txt style={styles.marker} importantForAccessibility="no">
            {ordered ? `${(Number.isFinite(start) ? start : 1) + index}.` : '•'}
          </Txt>
          <View style={styles.itemBody}>
            <Children nodes={item.children} spaced={false} />
          </View>
        </View>
      ))}
    </View>
  )
}

function HtmlImage({ element }: { element: HtmlElement }) {
  const { palette } = useTheme()
  const width = Number(element.attrs.width)
  const height = Number(element.attrs.height)
  const alt = element.attrs.alt?.trim() ?? ''
  return (
    <View
      style={[
        styles.image,
        {
          aspectRatio: width > 0 && height > 0 ? width / height : 3 / 2,
          backgroundColor: palette.plate[1],
        },
      ]}
      accessible={alt.length > 0}
      accessibilityRole={alt ? 'image' : undefined}
      accessibilityLabel={alt || undefined}
      importantForAccessibility={alt ? 'yes' : 'no-hide-descendants'}
    >
      <Image
        source={{ uri: element.attrs.src }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="disk"
        accessible={false}
      />
    </View>
  )
}

function textOf(node: HtmlNode): string {
  return node.type === 'text' ? node.text : node.children.map(textOf).join('')
}

function styleFor(
  inline: InlineStyle,
  face: 'serif' | 'sans',
  codeBackground: string,
): TextStyle {
  const decorations = [
    inline.underline ? 'underline' : null,
    inline.strike ? 'line-through' : null,
  ].filter(Boolean)
  return {
    fontFamily: inline.code
      ? type.code.fontFamily
      : familyFor(face, { bold: inline.bold, italic: inline.italic }),
    ...(inline.code ? { backgroundColor: codeBackground } : {}),
    ...(decorations.length
      ? {
          textDecorationLine: decorations.join(
            ' ',
          ) as TextStyle['textDecorationLine'],
        }
      : {}),
    ...(inline.small ? { fontSize: 14 } : {}),
  }
}

/** Inline content, with whitespace collapsed and styles carried down. */
function InlineRun({
  nodes,
  inherited,
  face = 'sans',
}: {
  nodes: HtmlNode[]
  inherited: InlineStyle
  face?: 'serif' | 'sans'
}) {
  const { palette } = useTheme()
  const openLink = useOpenLink()

  return (
    <>
      {nodes.map((node, index) => {
        if (node.type === 'text') {
          const text = node.text.replace(/\s+/g, ' ')
          return text ? (
            <Text key={index} style={styleFor(inherited, face, palette.line)}>
              {text}
            </Text>
          ) : null
        }

        const { name } = node
        if (name === 'br') return <Text key={index}>{'\n'}</Text>

        const style: InlineStyle = {
          bold: inherited.bold || name === 'strong' || name === 'b',
          italic: inherited.italic || ['em', 'i', 'cite'].includes(name),
          underline: inherited.underline || name === 'u',
          strike: inherited.strike || ['s', 'del', 'strike'].includes(name),
          code: inherited.code || name === 'code',
          small: inherited.small || ['small', 'sub', 'sup'].includes(name),
        }

        if (
          name === 'a' &&
          node.attrs.href &&
          !node.attrs.href.startsWith('#')
        ) {
          const href = node.attrs.href
          return (
            <Text
              key={index}
              accessibilityRole="link"
              style={{ color: palette.accent, textDecorationLine: 'underline' }}
              onPress={() => openLink(href)}
            >
              <InlineRun nodes={node.children} inherited={style} face={face} />
            </Text>
          )
        }

        return (
          <InlineRun
            key={index}
            nodes={node.children}
            inherited={style}
            face={face}
          />
        )
      })}
    </>
  )
}

const styles = StyleSheet.create({
  paragraph: { marginBottom: space.md },
  /** Paragraphs within a quotation, close enough to read as one passage. */
  heading: { marginTop: space.md, marginBottom: space.sm },
  figure: { marginVertical: space.sm },
  caption: { marginTop: space.xs, marginBottom: space.md },
  image: { width: '100%', overflow: 'hidden', borderRadius: 2 },
  rule: { height: StyleSheet.hairlineWidth, marginVertical: space.lg },
  pre: { padding: space.sm, marginBottom: space.md, borderRadius: 2 },
  list: { marginBottom: space.md, gap: space.xs },
  item: { flexDirection: 'row', gap: space.sm },
  marker: { minWidth: 22, textAlign: 'right' },
  itemBody: { flex: 1 },
  table: { marginBottom: space.md },
  tableRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: space.xs,
  },
  tableCell: { flexGrow: 1, flexBasis: 120 },
})
