// Rich text from the CMS, node by node, as native views.
//
// Rendered exactly as received. The server has already stripped a leading
// title heading, dropped comment-only paragraphs, removed paywall markers, cut
// a gated post to its teaser and unlinked links to unpublished posts; doing any
// of that again here would only be a chance to disagree with it.

import { StyleSheet, View } from 'react-native'

import type {
  BodyNode,
  HeadingNode,
  InlineNode,
  ListNode,
} from '../api/contract'
import { Txt } from '../theme/text'
import { useTheme } from '../theme/theme'
import { space, type TypeVariant } from '../theme/typography'
import { BlockView } from './blocks'
import { warnUnsupported } from './diagnostics'
import { ReaderImage } from './image'
import { InlineNodes } from './inline'
import { QuoteFrame, quoteText } from './quote'

const HEADING_VARIANT: Record<HeadingNode['tag'], TypeVariant> = {
  h1: 'title',
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  h5: 'h5',
  h6: 'h6',
}

export function LexicalNodes({ nodes }: { nodes: BodyNode[] }) {
  return (
    <>
      {nodes.map((node, index) => (
        <BodyNodeView key={index} node={node} />
      ))}
    </>
  )
}

function BodyNodeView({ node }: { node: BodyNode }) {
  const { palette } = useTheme()

  switch (node.type) {
    case 'paragraph':
      return node.children.length === 0 ? null : (
        <Txt style={styles.paragraph}>
          <InlineNodes nodes={node.children} />
        </Txt>
      )
    case 'heading':
      return (
        <Txt
          variant={HEADING_VARIANT[node.tag]}
          accessibilityRole="header"
          style={styles.heading}
        >
          <InlineNodes
            nodes={node.children}
            variant={HEADING_VARIANT[node.tag]}
          />
        </Txt>
      )
    case 'quote':
      return (
        <QuoteFrame>
          <Txt variant="quote" style={quoteText}>
            <InlineNodes nodes={node.children} variant="quote" />
          </Txt>
        </QuoteFrame>
      )
    case 'list':
      return <ListView list={node} depth={0} />
    case 'horizontalrule':
      return (
        <View
          style={[styles.rule, { backgroundColor: palette.rule }]}
          accessible={false}
          importantForAccessibility="no"
        />
      )
    case 'upload':
      return <ReaderImage media={node.media} />
    case 'block':
      return <BlockView fields={node.fields} />
    case 'unsupported':
      warnUnsupported(node.nodeType, node.blockType)
      return null
  }
}

function markerFor(
  list: ListNode,
  index: number,
  checked: boolean | null,
): string {
  if (list.listType === 'check') return checked ? '☑' : '☐'
  if (list.listType === 'number') return `${list.start + index}.`
  return '•'
}

function ListView({ list, depth }: { list: ListNode; depth: number }) {
  return (
    <View style={[styles.list, depth > 0 && styles.nestedList]}>
      {list.children.map((item, index) => {
        const inline = item.children.filter(
          (child): child is InlineNode => child.type !== 'list',
        )
        const nested = item.children.filter(
          (child): child is ListNode => child.type === 'list',
        )
        const checkbox = list.listType === 'check'
        return (
          <View key={index} style={styles.item}>
            <Txt
              style={styles.marker}
              accessibilityRole={checkbox ? 'checkbox' : undefined}
              accessibilityState={
                checkbox ? { checked: Boolean(item.checked) } : undefined
              }
              accessibilityLabel={
                checkbox ? (item.checked ? 'Done' : 'Not done') : undefined
              }
              importantForAccessibility={checkbox ? 'yes' : 'no'}
            >
              {markerFor(list, index, item.checked)}
            </Txt>
            <View style={styles.itemBody}>
              {inline.length > 0 ? (
                <Txt>
                  <InlineNodes nodes={inline} />
                </Txt>
              ) : null}
              {nested.map((child, childIndex) => (
                <ListView key={childIndex} list={child} depth={depth + 1} />
              ))}
            </View>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  paragraph: { marginBottom: space.md },
  heading: { marginTop: space.md, marginBottom: space.sm },
  rule: { height: StyleSheet.hairlineWidth, marginVertical: space.lg },
  list: { marginBottom: space.md, gap: space.xs },
  nestedList: { marginTop: space.xs, marginBottom: 0 },
  item: { flexDirection: 'row', gap: space.sm },
  marker: { minWidth: 22, textAlign: 'right' },
  itemBody: { flex: 1 },
})
