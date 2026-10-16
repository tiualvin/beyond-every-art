import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useColorScheme } from 'react-native'

import {
  DEFAULT_PREFERENCES,
  useAccessibilityPreferences,
  type AccessibilityPreferences,
} from './accessibility'
import { inverseOf, paletteFor, type Palette, type Scheme } from './palette'

export type Theme = {
  scheme: Scheme
  palette: Palette
  preferences: AccessibilityPreferences
}

const ThemeContext = createContext<Theme>({
  scheme: 'light',
  palette: paletteFor('light', false),
  preferences: DEFAULT_PREFERENCES,
})

/** Follows the system's appearance and accessibility settings. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme: Scheme = useColorScheme() === 'dark' ? 'dark' : 'light'
  const preferences = useAccessibilityPreferences()
  const theme = useMemo(
    () => ({
      scheme,
      preferences,
      palette: paletteFor(scheme, preferences.increaseContrast),
    }),
    [scheme, preferences],
  )
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
}

/** A fixed theme, for tests and previews. */
export function StaticTheme({
  scheme = 'light',
  preferences = DEFAULT_PREFERENCES,
  children,
}: {
  scheme?: Scheme
  preferences?: AccessibilityPreferences
  children: ReactNode
}) {
  const theme = useMemo(
    () => ({
      scheme,
      preferences,
      palette: paletteFor(scheme, preferences.increaseContrast),
    }),
    [scheme, preferences],
  )
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
}

/** Children drawn on the inverse surface: light text on dark, either way round. */
export function InverseTheme({ children }: { children: ReactNode }) {
  const theme = useContext(ThemeContext)
  const inverse = useMemo(
    () => ({ ...theme, palette: inverseOf(theme.palette) }),
    [theme],
  )
  return (
    <ThemeContext.Provider value={inverse}>{children}</ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
