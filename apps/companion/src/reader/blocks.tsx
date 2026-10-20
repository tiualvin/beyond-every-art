// The insertable modules, one native renderer each.
//
// Typed as a record over the generated block slugs, so a block the website
// adds is a compile error here until somebody decides how it renders on a
// phone — the same guarantee the website's own registry gives itself. Three
// modules are web interactions and are handled as native link-outs instead:
// the newsletter signup, the call-to-action button, and the video embed. The
// choices, block by block, are in docs/COMPANION_APP.md.

import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import type { BlockFields } from '../api/contract'
import type { BlockSlug } from '../generated/block-slugs'
import { Button } from '../theme/button'
import { Txt } from '../theme/text'
import { InverseTheme, useTheme } from '../theme/theme'
import { MIN_TOUCH, space } from '../theme/typography'
import { ReaderImage } from './image'
import { InlineNodes } from './inline'
import { ContainedNodes, LexicalNodes } from './lexical'
import { useOpenExternal, useOpenLink } from './link-context'

type Renderers = {
  [K in BlockSlug]: (props: {
    fields: Extract<BlockFields, { blockType: K }>
  }) => React.ReactElement | null
}

const PROVIDER_NAMES = { youtube: 'YouTube', vimeo: 'Vimeo' } as const

function Accordion({
  fields,
}: {
  fields: Extract<BlockFields, { blockType: 'accordion' }>
}) {
  const { palette } = useTheme()
  const [open, setOpen] = useState(() =>
    fields.items.map((item) => item.defaultOpen),
  )
  return (
    <View style={styles.block}>
      {fields.heading ? (
        <Txt
          variant="h3"
          accessibilityRole="header"
          style={styles.blockHeading}
        >
          {fields.heading}
        </Txt>
      ) : null}
      {fields.items.map((item, index) => (
        <View key={index} style={[styles.panel, { borderColor: palette.rule }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: open[index] }}
            onPress={() =>
              setOpen((current) =>
                current.map((value, at) => (at === index ? !value : value)),
              )
            }
            style={styles.panelHeader}
          >
            <Txt variant="label" style={styles.flex}>
              {item.title}
            </Txt>
            <Txt variant="label" tone="muted" importantForAccessibility="no">
              {open[index] ? '−' : '+'}
            </Txt>
          </Pressable>
          {open[index] ? (
            <View style={styles.panelBody}>
              <ContainedNodes nodes={item.content} />
            </View>
          ) : null}
        </View>
      ))}
    </View>
  )
}

function PullQuote({
  fields,
}: {
  fields: Extract<BlockFields, { blockType: 'pullQuote' }>
}) {
  const { palette } = useTheme()
  const openExternal = useOpenExternal()
  const centered = fields.variant === 'centered'
  return (
    <View
      style={[
        styles.block,
        fields.variant === 'bordered' && {
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: palette.rule,
          paddingVertical: space.md,
        },
      ]}
    >
      <Txt
        variant="quote"
        style={[
          centered && styles.centered,
          fields.variant === 'large' && styles.largeQuote,
        ]}
      >
        {fields.quote}
      </Txt>
      {fields.attribution ? (
        fields.sourceHref ? (
          <Txt
            variant="meta"
            tone="accent"
            accessibilityRole="link"
            accessibilityHint="Opens the source in your browser"
            onPress={() => openExternal(fields.sourceHref!)}
            style={[
              styles.attribution,
              centered && styles.centered,
              styles.underline,
            ]}
          >
            — {fields.attribution}
          </Txt>
        ) : (
          <Txt
            variant="meta"
            tone="muted"
            style={[styles.attribution, centered && styles.centered]}
          >
            — {fields.attribution}
          </Txt>
        )
      ) : null}
    </View>
  )
}

/** A link to the website's signup page. The app collects no address itself. */
function Signup({
  fields,
}: {
  fields: Extract<BlockFields, { blockType: 'signup' }>
}) {
  const { palette } = useTheme()
  const openExternal = useOpenExternal()
  return (
    <View
      style={[
        styles.block,
        styles.card,
        { backgroundColor: palette.surface, borderColor: palette.line },
      ]}
    >
      <Txt variant="h4" accessibilityRole="header">
        {fields.heading}
      </Txt>
      {fields.body ? <Txt tone="muted">{fields.body}</Txt> : null}
      <Button
        label="Sign up on the website"
        hint="Opens the newsletter page in your browser"
        onPress={() => openExternal(fields.href)}
        style={styles.cardAction}
      />
    </View>
  )
}

function Callout({
  fields,
}: {
  fields: Extract<BlockFields, { blockType: 'callout' }>
}) {
  const { palette } = useTheme()
  const tone =
    fields.tone === 'dark'
      ? { backgroundColor: palette.inverse }
      : fields.tone === 'accent'
        ? {
            backgroundColor: palette.surface,
            borderColor: palette.accent,
            borderWidth: 1,
          }
        : {
            backgroundColor: palette.surface,
            borderColor: palette.line,
            borderWidth: 1,
          }
  const content = <ContainedNodes nodes={fields.content} />
  return (
    <View style={[styles.block, styles.callout, tone]}>
      {fields.emoji ? (
        // Decorative, and hidden from screen readers, as the website hides it.
        <Txt
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          style={styles.emoji}
        >
          {fields.emoji}
        </Txt>
      ) : null}
      <View style={styles.flex}>
        {fields.tone === 'dark' ? (
          <InverseTheme>{content}</InverseTheme>
        ) : (
          content
        )}
      </View>
    </View>
  )
}

function ActionButton({
  fields,
}: {
  fields: Extract<BlockFields, { blockType: 'button' }>
}) {
  const openLink = useOpenLink()
  return (
    <View
      style={[styles.block, fields.align === 'center' && styles.alignCenter]}
    >
      <Button
        label={fields.label}
        variant={fields.variant}
        onPress={() => openLink(fields.href)}
      />
    </View>
  )
}

function Gallery({
  fields,
}: {
  fields: Extract<BlockFields, { blockType: 'gallery' }>
}) {
  const grid = fields.layout === 'grid' && fields.items.length > 1
  return (
    <View style={styles.block}>
      <View style={grid ? styles.grid : undefined}>
        {fields.items.map((item, index) => (
          <View key={index} style={grid ? styles.gridCell : undefined}>
            <ReaderImage
              media={item.media}
              size={grid ? 'card' : 'full'}
              caption={item.caption}
            />
          </View>
        ))}
      </View>
      {fields.caption ? (
        <Txt variant="meta" tone="muted">
          {fields.caption}
        </Txt>
      ) : null}
    </View>
  )
}

function Bookmark({
  fields,
}: {
  fields: Extract<BlockFields, { blockType: 'bookmark' }>
}) {
  const { palette } = useTheme()
  const openExternal = useOpenExternal()
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityHint="Opens in your browser"
      onPress={() => openExternal(fields.href)}
      style={({ pressed }) => [
        styles.block,
        styles.card,
        { backgroundColor: palette.surface, borderColor: palette.line },
        pressed && styles.pressed,
      ]}
    >
      {fields.image ? (
        <ReaderImage media={fields.image} size="card" showCredit={false} />
      ) : null}
      <Txt variant="label">{fields.title}</Txt>
      {fields.description ? (
        <Txt variant="meta" tone="muted">
          {fields.description}
        </Txt>
      ) : null}
      <Txt variant="meta" tone="accent">
        {fields.publisher ?? new URL(fields.href).hostname}
      </Txt>
    </Pressable>
  )
}

/** A video, as a link: no web view, and no request to the provider until tapped. */
function Embed({
  fields,
}: {
  fields: Extract<BlockFields, { blockType: 'embed' }>
}) {
  const { palette } = useTheme()
  const openExternal = useOpenExternal()
  const provider = fields.provider ? PROVIDER_NAMES[fields.provider] : null
  return (
    <View
      style={[
        styles.block,
        styles.card,
        { backgroundColor: palette.surface, borderColor: palette.line },
      ]}
    >
      <Txt variant="meta" tone="muted">
        {provider ? `Video · ${provider}` : 'Link'}
      </Txt>
      <Txt variant="label">{fields.title}</Txt>
      <Button
        label={provider ? `Watch on ${provider}` : 'Open link'}
        variant="secondary"
        hint="Opens in your browser"
        onPress={() => openExternal(fields.href)}
        style={styles.cardAction}
      />
    </View>
  )
}

function KeyTakeaways({
  fields,
}: {
  fields: Extract<BlockFields, { blockType: 'keyTakeaways' }>
}) {
  const { palette } = useTheme()
  return (
    <View style={[styles.block, styles.card, { borderColor: palette.rule }]}>
      <Txt variant="h4" accessibilityRole="header" style={styles.blockHeading}>
        {fields.heading}
      </Txt>
      {fields.items.map((item, index) => (
        <View key={index} style={styles.row}>
          <Txt tone="accent" style={styles.number}>
            {index + 1}.
          </Txt>
          <Txt style={styles.flex}>{item}</Txt>
        </View>
      ))}
    </View>
  )
}

function Faq({
  fields,
}: {
  fields: Extract<BlockFields, { blockType: 'faq' }>
}) {
  return (
    <View style={styles.block}>
      <Txt variant="h3" accessibilityRole="header" style={styles.blockHeading}>
        {fields.heading}
      </Txt>
      {fields.items.map((item, index) => (
        <View key={index} style={styles.faqItem}>
          <Txt variant="h5" accessibilityRole="header">
            {item.question}
          </Txt>
          <ContainedNodes nodes={item.answer} />
        </View>
      ))}
    </View>
  )
}

function FeatureList({
  fields,
}: {
  fields: Extract<BlockFields, { blockType: 'featureList' }>
}) {
  const numbered = fields.variant === 'steps' || fields.numbered
  return (
    <View style={styles.block}>
      {fields.heading ? (
        <Txt
          variant="h3"
          accessibilityRole="header"
          style={styles.blockHeading}
        >
          {fields.heading}
        </Txt>
      ) : null}
      {fields.intro ? <Txt tone="muted">{fields.intro}</Txt> : null}
      {fields.items.map((item, index) => (
        <View key={index} style={styles.featureItem}>
          {item.image ? <ReaderImage media={item.image} size="card" /> : null}
          <Txt variant="h4" accessibilityRole="header">
            {numbered ? `${index + 1}. ` : ''}
            {item.title}
          </Txt>
          {item.body ? <Txt>{item.body}</Txt> : null}
        </View>
      ))}
    </View>
  )
}

/** Image first and text second, whichever side the website puts it on. */
function MediaText({
  fields,
}: {
  fields: Extract<BlockFields, { blockType: 'mediaText' }>
}) {
  return (
    <View style={styles.block}>
      {fields.media ? <ReaderImage media={fields.media} /> : null}
      {fields.heading ? (
        <Txt
          variant="h4"
          accessibilityRole="header"
          style={styles.blockHeading}
        >
          {fields.heading}
        </Txt>
      ) : null}
      <LexicalNodes nodes={fields.body} />
    </View>
  )
}

/**
 * A table, as one card per row. Five columns do not fit a phone, and a row
 * read as "label: value" is how a screen reader would want it anyway.
 */
function ComparisonTable({
  fields,
}: {
  fields: Extract<BlockFields, { blockType: 'comparisonTable' }>
}) {
  const { palette } = useTheme()
  return (
    <View style={styles.block}>
      <Txt variant="label" style={styles.blockHeading}>
        {fields.caption}
      </Txt>
      {fields.rows.map((row, rowIndex) => (
        <View
          key={rowIndex}
          style={[styles.tableRow, { borderColor: palette.rule }]}
        >
          <Txt variant="label" accessibilityRole="header">
            {fields.rowHeader ? (
              <Txt variant="meta" tone="muted">{`${fields.rowHeader}: `}</Txt>
            ) : null}
            <InlineNodes nodes={row.label} variant="label" />
          </Txt>
          {fields.columns.map((column, columnIndex) => {
            const cell = row.cells[columnIndex] ?? []
            return (
              <View key={columnIndex} style={styles.row}>
                <Txt variant="meta" tone="muted" style={styles.columnLabel}>
                  {column}
                </Txt>
                <Txt style={styles.flex}>
                  {cell.length > 0 ? <InlineNodes nodes={cell} /> : '—'}
                </Txt>
              </View>
            )
          })}
        </View>
      ))}
    </View>
  )
}

function KeyFacts({
  fields,
}: {
  fields: Extract<BlockFields, { blockType: 'keyFacts' }>
}) {
  const { palette } = useTheme()
  return (
    <View style={[styles.block, styles.card, { borderColor: palette.rule }]}>
      {fields.heading ? (
        <Txt
          variant="h4"
          accessibilityRole="header"
          style={styles.blockHeading}
        >
          {fields.heading}
        </Txt>
      ) : null}
      {fields.items.map((item, index) => (
        <View key={index} style={styles.row}>
          <Txt variant="meta" tone="muted" style={styles.columnLabel}>
            {item.label}
          </Txt>
          <Txt style={styles.flex}>{item.value}</Txt>
        </View>
      ))}
    </View>
  )
}

const renderers: Renderers = {
  accordion: Accordion,
  pullQuote: PullQuote,
  signup: Signup,
  callout: Callout,
  button: ActionButton,
  gallery: Gallery,
  bookmark: Bookmark,
  embed: Embed,
  // The server cuts a gated body at this marker and removes it everywhere
  // else, so it should never arrive. If it does, it is still not content.
  paywall: () => null,
  keyTakeaways: KeyTakeaways,
  faq: Faq,
  featureList: FeatureList,
  mediaText: MediaText,
  comparisonTable: ComparisonTable,
  keyFacts: KeyFacts,
}

export function BlockView({ fields }: { fields: BlockFields }) {
  const Renderer = renderers[fields.blockType] as (props: {
    fields: BlockFields
  }) => React.ReactElement | null
  return <Renderer fields={fields} />
}

const styles = StyleSheet.create({
  block: { marginVertical: space.md, gap: space.sm },
  blockHeading: { marginBottom: space.xs },
  card: { borderWidth: 1, borderRadius: 2, padding: space.md },
  cardAction: { alignSelf: 'flex-start', marginTop: space.xs },
  panel: { borderTopWidth: StyleSheet.hairlineWidth },
  panelHeader: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  panelBody: { paddingBottom: space.md },
  flex: { flex: 1 },
  centered: { textAlign: 'center' },
  largeQuote: { fontSize: 28, lineHeight: 36 },
  attribution: { marginTop: space.xs },
  underline: { textDecorationLine: 'underline' },
  callout: {
    flexDirection: 'row',
    gap: space.sm,
    padding: space.md,
    borderRadius: 2,
  },
  emoji: { fontSize: 22, lineHeight: 28 },
  alignCenter: { alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  gridCell: { flexBasis: '47%', flexGrow: 1 },
  pressed: { opacity: 0.7 },
  row: { flexDirection: 'row', gap: space.sm },
  number: { minWidth: 22 },
  faqItem: { marginTop: space.md, gap: space.sm },
  featureItem: { marginTop: space.sm, gap: space.xs },
  tableRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: space.sm,
    gap: space.xs,
  },
  columnLabel: { width: '38%' },
})
