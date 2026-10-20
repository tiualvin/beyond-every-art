// A group on a screen: a small label over a rule, then what it holds.
//
// Grouping comes from space and a line, the way the website and its
// prototypes group a page (`.section`, the journal's month labels): sections
// are 48pt apart, and each label stands on its own rule, which then divides it
// from the first row. A rule above the label read as the end of the section
// before it. The label is the `section` role — small uppercase Inter — so it
// names the group without competing with the headlines inside it.

import type { ReactNode } from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'

import { Txt } from '../theme/text'
import { useTheme } from '../theme/theme'
import { space } from '../theme/typography'

/** The label and its rule, for lists that draw their own rows (FlatList). */
export function SectionHeader({
  label,
  style,
}: {
  label: string
  style?: StyleProp<ViewStyle>
}) {
  const { palette } = useTheme()
  return (
    <View style={style}>
      <Txt
        variant="section"
        tone="muted"
        accessibilityRole="header"
        style={styles.label}
      >
        {label}
      </Txt>
      <View style={[styles.rule, { backgroundColor: palette.rule }]} />
    </View>
  )
}

export function Section({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <View>
      <SectionHeader label={label} />
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  rule: { height: 1 },
  label: { marginBottom: space.sm },
})
