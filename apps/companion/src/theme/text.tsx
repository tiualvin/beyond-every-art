import { Platform, Text, type TextProps } from 'react-native'

import { useTheme } from './theme'
import {
  HEADLINE_MAX_SCALE,
  TYPE_SPECS,
  type,
  type TypeVariant,
} from './typography'

type Tone = 'text' | 'muted' | 'accent' | 'onButton' | 'onInverse'

/**
 * Text in one of the app's roles. Scales with the system text size along the
 * role's own Dynamic Type curve: no caller can switch scaling off from here.
 * Headlines break into balanced lines.
 */
export function Txt({
  variant = 'body',
  tone = 'text',
  style,
  ...props
}: TextProps & { variant?: TypeVariant; tone?: Tone }) {
  const { palette } = useTheme()
  const spec = TYPE_SPECS[variant]
  return (
    <Text
      dynamicTypeRamp={spec.ramp}
      lineBreakStrategyIOS={spec.balance ? 'push-out' : undefined}
      textBreakStrategy={spec.balance ? 'balanced' : undefined}
      maxFontSizeMultiplier={
        spec.balance && Platform.OS === 'android'
          ? HEADLINE_MAX_SCALE
          : undefined
      }
      {...props}
      allowFontScaling
      style={[type[variant], { color: palette[tone] }, style]}
    />
  )
}
