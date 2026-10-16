import { Text, type TextProps } from 'react-native'

import { useTheme } from './theme'
import { type, type TypeVariant } from './typography'

type Tone = 'text' | 'muted' | 'accent' | 'onButton' | 'onInverse'

/**
 * Text in one of the app's styles. Scales with the system text size: no
 * caller can switch Dynamic Type off from here.
 */
export function Txt({
  variant = 'body',
  tone = 'text',
  style,
  ...props
}: TextProps & { variant?: TypeVariant; tone?: Tone }) {
  const { palette } = useTheme()
  return (
    <Text
      {...props}
      allowFontScaling
      style={[type[variant], { color: palette[tone] }, style]}
    />
  )
}
