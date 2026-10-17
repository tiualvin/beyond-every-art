// Inline rich text: runs of text, line breaks and links, as nested Text.

import { Fragment } from 'react'
import { Text, type TextStyle } from 'react-native'

import { TEXT_FORMAT, type InlineNode } from '../api/contract'
import { familyFor } from '../theme/fonts'
import { useTheme } from '../theme/theme'
import { type } from '../theme/typography'
import { warnUnsupported } from './diagnostics'
import { useOpenArticle, useOpenLink } from './link-context'

export type Face = 'serif' | 'sans'

const has = (format: number, bit: number) => (format & bit) === bit

/**
 * The style a Lexical format sum asks for, in a given face.
 *
 * `italic` is the run's surroundings: text inside a quotation is italic
 * whether or not its own format says so. Each run names its own font family,
 * and a custom family has no synthetic italic, so a run that does not ask for
 * the italic family here is drawn upright however its parent is set.
 */
export function formatStyle(
  format: number,
  face: Face,
  codeBackground: string,
  italic = false,
): TextStyle {
  const decorations = [
    has(format, TEXT_FORMAT.underline) ? 'underline' : null,
    has(format, TEXT_FORMAT.strikethrough) ? 'line-through' : null,
  ].filter(Boolean)
  const script =
    has(format, TEXT_FORMAT.subscript) || has(format, TEXT_FORMAT.superscript)

  return {
    ...(has(format, TEXT_FORMAT.code)
      ? { fontFamily: type.code.fontFamily, backgroundColor: codeBackground }
      : {
          fontFamily: familyFor(face, {
            bold: has(format, TEXT_FORMAT.bold),
            italic: italic || has(format, TEXT_FORMAT.italic),
          }),
        }),
    ...(decorations.length
      ? {
          textDecorationLine: decorations.join(
            ' ',
          ) as TextStyle['textDecorationLine'],
        }
      : {}),
    ...(script ? { fontSize: 12 } : {}),
    ...(has(format, TEXT_FORMAT.highlight)
      ? { backgroundColor: codeBackground }
      : {}),
  }
}

export function InlineNodes({
  nodes,
  face = 'sans',
  italic = false,
}: {
  nodes: InlineNode[]
  face?: Face
  /** Set the whole run in italic, as a quotation is. */
  italic?: boolean
}) {
  const { palette } = useTheme()
  const openLink = useOpenLink()
  const openArticle = useOpenArticle()

  const linkStyle: TextStyle = {
    color: palette.accent,
    textDecorationLine: 'underline',
  }

  return (
    <>
      {nodes.map((node, index) => {
        switch (node.type) {
          case 'text':
            return (
              <Text
                key={index}
                style={formatStyle(node.format, face, palette.line, italic)}
              >
                {node.text}
              </Text>
            )
          case 'linebreak':
            return <Fragment key={index}>{'\n'}</Fragment>
          case 'link':
            return (
              <Text
                key={index}
                accessibilityRole="link"
                style={linkStyle}
                onPress={() => openLink(node.href)}
              >
                <InlineNodes
                  nodes={node.children}
                  face={face}
                  italic={italic}
                />
              </Text>
            )
          case 'internalLink':
            return (
              <Text
                key={index}
                accessibilityRole="link"
                style={linkStyle}
                onPress={() => openArticle(node.slug, node.href)}
              >
                <InlineNodes
                  nodes={node.children}
                  face={face}
                  italic={italic}
                />
              </Text>
            )
          case 'unsupported':
            warnUnsupported(node.nodeType, node.blockType)
            return null
        }
      })}
    </>
  )
}
