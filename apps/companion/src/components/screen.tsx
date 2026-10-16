import type { ReactNode } from 'react'
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native'

import { useTheme } from '../theme/theme'
import { space } from '../theme/typography'

/** The reading measure on a tablet: wide enough for a line, no wider. */
export const MAX_CONTENT_WIDTH = 680

export function Screen({
  children,
  refreshing,
  onRefresh,
  bottomInset = 0,
}: {
  children: ReactNode
  refreshing?: boolean
  onRefresh?: () => void
  bottomInset?: number
}) {
  const { palette } = useTheme()
  return (
    <ScrollView
      style={{ backgroundColor: palette.background }}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: space.xl + bottomInset },
      ]}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={Boolean(refreshing)}
            onRefresh={onRefresh}
          />
        ) : undefined
      }
    >
      <View style={styles.column}>{children}</View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.md, paddingTop: space.md },
  column: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    gap: space.md,
  },
})
