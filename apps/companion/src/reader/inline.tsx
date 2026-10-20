// Inline rich text: runs of text, line breaks and links, as nested Text.

import { Fragment } from 'react'
import { Text, type TextStyle } from 'react-native'

import { TEXT_FORMAT, type InlineNode } from '../api/contract'
import { useTheme } from '../theme/theme'
import {
  MONOSPACE,
  TYPE_SPECS,
  familyOf,
  type TypeVariant,
} from '../theme/typography'
import { warnUnsupported } from './diagnostics'
import { useOpenArticle, useOpenLink } from './link-context'

const has = (format: number, bit: number) => (format & bit) === bit

/**
 * The style a Lexical format sum asks for, inside a run of a given role.
 *
 * Each run names its own font family, and a custom family has no synthetic
 * bold or italic, so the family has to come from the role the run sits in:
 * a run inside a heading is set at the heading's weight, a run inside a
 * quotation in its italic. Taking the face alone is how quotations once came
 * out upright and in the headline weight.
 */
export function formatStyle(
  format: number,
  variant: TypeVariant,
  codeBackground: string,
): TextStyle {
  const spec = TYPE_SPECS[variant]
  const decorations = [
    has(format, TEXT_FORMAT.underline) ? 'underline' : null,
    has(format, TEXT_FORMAT.strikethrough) ? 'line-through' : null,
  ].filter(Boolean)
  const script =
    has(format, TEXT_FORMAT.subscript) || has(format, TEXT_FORMAT.superscript)

  return {
    ...(has(format, TEXT_FORMAT.code)
      ? { fontFamily: MONOSPACE, backgroundColor: codeBackground }
      : {
          fontFamily: familyOf(spec, {
            bold: has(format, TEXT_FORMAT.bold),
            italic: has(format, TEXT_FORMAT.italic),
          }),
        }),
    ...(decorations.length
      ? {
          textDecorationLine: decorations.join(
            ' ',
          ) as TextStyle['textDecorationLine'],
        }
      : {}),
    // Relative to the run, so a figure in a heading is not body-sized.
    ...(script ? { fontSize: Math.round(spec.size * 0.72) } : {}),
    ...(has(format, TEXT_FORMAT.highlight)
      ? { backgroundColor: codeBackground }
      : {}),
  }
}

export function InlineNodes({
  nodes,
  variant = 'body',
}: {
  nodes: InlineNode[]
  /** The role of the text these runs sit in. */
  variant?: TypeVariant
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
                style={formatStyle(node.format, variant, palette.code)}
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
                <InlineNodes nodes={node.children} variant={variant} />
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
                <InlineNodes nodes={node.children} variant={variant} />
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
