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
  spacing = 'compact',
}: {
  children: ReactNode
  refreshing?: boolean
  onRefresh?: () => void
  bottomInset?: number
  /**
   * `sections` puts 48pt between the screen's top-level groups, so a screen
   * reads as distinct sections rather than one stream at one gap.
   */
  spacing?: 'sections' | 'compact'
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
      <View
        style={[
          styles.column,
          { gap: spacing === 'sections' ? space.xxl : space.md },
        ]}
      >
        {children}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.md, paddingTop: space.md },
  column: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
  },
})
