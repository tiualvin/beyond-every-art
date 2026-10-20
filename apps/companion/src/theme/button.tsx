import type { ReactNode } from 'react'
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'

import { Txt } from './text'
import { useTheme } from './theme'
import { CAPSULE, MIN_TOUCH, space } from './typography'

/** Pressing dims a control on iOS and the web; Android ripples instead. */
export function pressedStyle(pressed: boolean) {
  return pressed && Platform.OS !== 'android' ? styles.pressed : undefined
}

/**
 * The capsule a control is clipped to. Android draws a pressable's ripple to
 * its own rectangle, whatever its border radius, so the clip has to belong to
 * a parent: without one, every capsule rippled as a square. Layout from the
 * caller (alignment, margins) goes here too, on the outside of the shape.
 */
export function Capsule({
  style,
  children,
}: {
  style?: StyleProp<ViewStyle>
  children: ReactNode
}) {
  return <View style={[styles.capsule, style]}>{children}</View>
}

/**
 * A labelled button, in the platform's shape: a capsule. The label carries
 * the meaning; the fill is decoration. Pressing dims it on iOS and ripples on
 * Android, as each platform's own buttons do — never both.
 *
 * `primary` is the burgundy fill, for the one action a screen is for.
 * `secondary` is a tint, for everything else. `editorial` sets the label the
 * way the website sets a call to action in an article — small, uppercase and
 * tracked — and is for article content, not for the interface.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  editorial = false,
  hint,
  style,
  accessibilityLabel,
}: {
  label: string
  onPress: () => void
  variant?: 'primary' | 'secondary'
  editorial?: boolean
  hint?: string
  style?: StyleProp<ViewStyle>
  accessibilityLabel?: string
}) {
  const { palette } = useTheme()
  const primary = variant === 'primary'
  const fill = primary ? palette.button : palette.tonal
  const ink = primary ? palette.onButton : palette.onTonal
  return (
    <Capsule style={style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={hint}
        onPress={onPress}
        android_ripple={{ color: `${ink}33` }}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: fill },
          pressedStyle(pressed),
        ]}
      >
        <Txt variant={editorial ? 'action' : 'label'} style={{ color: ink }}>
          {label}
        </Txt>
      </Pressable>
    </Capsule>
  )
}

const styles = StyleSheet.create({
  capsule: { borderRadius: CAPSULE, overflow: 'hidden' },
  button: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: space.lg - space.xs,
    paddingVertical: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
})
