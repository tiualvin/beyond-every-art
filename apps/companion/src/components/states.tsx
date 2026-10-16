// What a screen says when it has nothing to show, is still loading, or failed.
// Honest, and specific: never placeholder copy standing in for content.

import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { ApiError } from '../api/client'
import { Button } from '../theme/button'
import { Txt } from '../theme/text'
import { useTheme } from '../theme/theme'
import { space } from '../theme/typography'

export function Loading({ label = 'Loading' }: { label?: string }) {
  const { palette } = useTheme()
  return (
    <View style={styles.centre} accessible accessibilityLabel={label}>
      <ActivityIndicator color={palette.muted} />
    </View>
  )
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <View style={styles.box}>
      <Txt variant="h4" accessibilityRole="header">
        {title}
      </Txt>
      {body ? <Txt tone="muted">{body}</Txt> : null}
    </View>
  )
}

/** Why a read failed, in words a reader can act on. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.kind === 'network')
      return 'The app could not reach the website. Check your connection.'
    if (error.kind === 'invalid')
      return 'The website answered in a form this version of the app cannot read.'
    if (error.status === 429)
      return 'Too many requests for now. Try again in a minute.'
  }
  return 'Something went wrong loading this.'
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
      <Txt variant="h4">Not loaded</Txt>
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

export function Notice({ children }: { children: string }) {
  const { palette } = useTheme()
  return (
    <View
      style={[
        styles.notice,
        { borderColor: palette.rule, backgroundColor: palette.surface },
      ]}
    >
      <Txt variant="meta" tone="muted">
        {children}
      </Txt>
    </View>
  )
}

const styles = StyleSheet.create({
  centre: { paddingVertical: space.xl, alignItems: 'center' },
  box: { gap: space.sm, paddingVertical: space.lg },
  action: { alignSelf: 'flex-start' },
  notice: { borderWidth: 1, borderRadius: 2, padding: space.sm },
})
