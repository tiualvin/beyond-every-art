import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router'
import { useMemo, type ReactNode } from 'react'

import { familyFor } from './theme/fonts'
import { useTheme } from './theme/theme'

/** The navigator's colours and fonts, from the app's theme. */
export function NavigationTheme({ children }: { children: ReactNode }) {
  const { palette, scheme } = useTheme()
  const value = useMemo(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: palette.accent,
        background: palette.background,
        card: palette.background,
        text: palette.text,
        border: palette.line,
        notification: palette.button,
      },
      fonts: {
        ...base.fonts,
        regular: { fontFamily: familyFor('sans'), fontWeight: '400' as const },
        medium: {
          fontFamily: familyFor('sans', { bold: true }),
          fontWeight: '600' as const,
        },
        bold: { fontFamily: familyFor('serif'), fontWeight: '600' as const },
        heavy: { fontFamily: familyFor('serif'), fontWeight: '600' as const },
      },
    }
  }, [palette, scheme])
  return <ThemeProvider value={value}>{children}</ThemeProvider>
}
