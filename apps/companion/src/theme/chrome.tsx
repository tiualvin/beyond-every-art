// The surface navigation chrome sits on: Liquid Glass where the system has it
// and the reader has not asked for less transparency, something solid
// everywhere else.
//
// Chrome only — the reader's floating actions, not cards or backgrounds — as
// the handoff asks. Android gets its own treatment: an elevated tonal surface
// in the brand's colours, rather than an imitation of Apple's material. Nothing
// here is the only way to tell what a control is: every one also has a label
// and a role.

import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from 'expo-glass-effect'
import type { ReactNode } from 'react'
import {
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'

import { useTheme } from './theme'

/** Whether this device and build can draw Liquid Glass at all. */
export function liquidGlassSupported(): boolean {
  if (Platform.OS !== 'ios') return false
  try {
    return isLiquidGlassAvailable() && isGlassEffectAPIAvailable()
  } catch {
    return false
  }
}

export type ChromeTreatment = 'glass' | 'android' | 'solid'

export function chromeTreatment(
  os: string,
  glassSupported: boolean,
  reduceTransparency: boolean,
): ChromeTreatment {
  if (os === 'android') return 'android'
  return glassSupported && !reduceTransparency ? 'glass' : 'solid'
}

export function ChromeSurface({
  children,
  style,
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  const { palette, preferences, scheme } = useTheme()
  const treatment = chromeTreatment(
    Platform.OS,
    liquidGlassSupported(),
    preferences.reduceTransparency,
  )

  if (treatment === 'glass') {
    return (
      <GlassView
        glassEffectStyle="regular"
        colorScheme={scheme}
        isInteractive
        style={[styles.shape, style]}
      >
        {children}
      </GlassView>
    )
  }

  return (
    <View
      style={[
        styles.shape,
        treatment === 'android'
          ? { backgroundColor: palette.surface, elevation: 3, borderRadius: 16 }
          : {
              backgroundColor: palette.surface,
              borderColor: palette.rule,
              borderWidth: StyleSheet.hairlineWidth,
              shadowColor: '#000',
              shadowOpacity: 0.12,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 4 },
            },
        style,
      ]}
    >
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  shape: { borderRadius: 22, overflow: 'hidden' },
})
