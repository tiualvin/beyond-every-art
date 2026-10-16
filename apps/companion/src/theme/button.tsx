import {
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native'

import { Txt } from './text'
import { useTheme } from './theme'
import { MIN_TOUCH, space } from './typography'

/**
 * A labelled button. The label carries the meaning; the fill is decoration,
 * and pressing dims it rather than animating it.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  hint,
  style,
  accessibilityLabel,
}: {
  label: string
  onPress: () => void
  variant?: 'primary' | 'secondary'
  hint?: string
  style?: StyleProp<ViewStyle>
  accessibilityLabel?: string
}) {
  const { palette } = useTheme()
  const primary = variant === 'primary'
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={hint}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary
          ? { backgroundColor: palette.button }
          : { borderColor: palette.text, borderWidth: 1 },
        pressed && styles.pressed,
        style,
      ]}
    >
      <Txt variant="label" tone={primary ? 'onButton' : 'text'}>
        {label}
      </Txt>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
})
