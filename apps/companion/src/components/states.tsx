// What a screen says when it has nothing to show, is still loading, or failed.
//
// Honest and specific, and always about the reader's situation: what will
// appear here, and the one thing to do next. Never placeholder copy standing
// in for content, and never the app's roadmap — "not built yet" and "once the
// website has collections" describe the project, not anything the reader can
// act on.

import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { ApiError } from '../api/client'
import { Button } from '../theme/button'
import { Txt } from '../theme/text'
import { useTheme } from '../theme/theme'
import { CAPSULE, space } from '../theme/typography'

export function Loading({ label = 'Loading' }: { label?: string }) {
  const { palette } = useTheme()
  return (
    <View style={styles.centre} accessible accessibilityLabel={label}>
      <ActivityIndicator color={palette.muted} />
    </View>
  )
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body?: string
  /**
   * The one next step, when there is one: a tint by default, or the primary
   * fill when making something is what the screen is for.
   */
  action?: {
    label: string
    onPress: () => void
    hint?: string
    variant?: 'primary' | 'secondary'
  }
}) {
  return (
    <View style={styles.box}>
      <Txt variant="emptyTitle" accessibilityRole="header">
        {title}
      </Txt>
      {body ? <Txt tone="muted">{body}</Txt> : null}
      {action ? (
        <Button
          label={action.label}
          hint={action.hint}
          variant={action.variant ?? 'secondary'}
          onPress={action.onPress}
          style={styles.action}
        />
      ) : null}
    </View>
  )
}

/** Why a read failed, in words a reader can act on. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.kind === 'network')
      return 'Check your connection, then try again. Articles you have saved open without one.'
    if (error.kind === 'invalid')
      return 'The website answered in a form this version of the app cannot read. An update to the app will fix it.'
    if (error.status === 429)
      return 'Too many requests for now. Try again in a minute.'
  }
  return 'Something went wrong on the way. Try again.'
}

export function ErrorState({
  error,
  onRetry,
}: {
  error: unknown
  onRetry?: () => void
}) {
  return (
    <View style={styles.box} accessibilityRole="alert">
      <Txt variant="emptyTitle">Couldn’t load this</Txt>
      <Txt tone="muted">{describeError(error)}</Txt>
      {onRetry ? (
        <Button
          label="Try again"
          variant="secondary"
          onPress={onRetry}
          style={styles.action}
        />
      ) : null}
    </View>
  )
}

/**
 * A line about the reader's situation — a saved copy, storage that will not
 * last — set quietly above the content it qualifies, not boxed like content.
 */
export function Notice({ children }: { children: string }) {
  return (
    <Txt variant="meta" tone="muted" accessibilityRole="text">
      {children}
    </Txt>
  )
}

/**
 * Says the app is showing its bundled sample articles: a small badge, once,
 * at the top of Today, the way a pre-release build is marked — not a box in
 * the content column.
 */
export function PreviewBadge() {
  const { palette } = useTheme()
  return (
    <View
      style={[styles.badge, { backgroundColor: palette.tonal }]}
      accessible
      accessibilityLabel="Preview build, showing sample articles"
    >
      <Txt variant="kicker" style={{ color: palette.onTonal }}>
        Preview · sample articles
      </Txt>
    </View>
  )
}

const styles = StyleSheet.create({
  centre: { paddingVertical: space.xl, alignItems: 'center' },
  box: { gap: space.sm, paddingVertical: space.lg },
  action: { alignSelf: 'flex-start', marginTop: space.sm },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.sm + space.xs,
    paddingVertical: space.xs,
    borderRadius: CAPSULE,
  },
})
