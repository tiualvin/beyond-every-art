// Playfair Display and Inter, the website's pairing, bundled with the app.
//
// Loaded from the files inside @expo-google-fonts, one weight per import so
// only these seven ship; nothing is fetched at runtime. A custom family has no
// synthetic bold or italic on Android, so every weight and style the reader
// uses is a family of its own.

import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular'
import { Inter_400Regular_Italic } from '@expo-google-fonts/inter/400Regular_Italic'
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold'
import { Inter_600SemiBold_Italic } from '@expo-google-fonts/inter/600SemiBold_Italic'
import { PlayfairDisplay_400Regular_Italic } from '@expo-google-fonts/playfair-display/400Regular_Italic'
import { PlayfairDisplay_600SemiBold } from '@expo-google-fonts/playfair-display/600SemiBold'
import { PlayfairDisplay_600SemiBold_Italic } from '@expo-google-fonts/playfair-display/600SemiBold_Italic'

export const FONT_ASSETS = {
  Inter_400Regular,
  Inter_400Regular_Italic,
  Inter_600SemiBold,
  Inter_600SemiBold_Italic,
  PlayfairDisplay_400Regular_Italic,
  PlayfairDisplay_600SemiBold,
  PlayfairDisplay_600SemiBold_Italic,
} as const

export type FontFamily = keyof typeof FONT_ASSETS

/** The family for a run of text, given the face it is set in. */
export function familyFor(
  face: 'serif' | 'sans',
  { bold = false, italic = false }: { bold?: boolean; italic?: boolean } = {},
): FontFamily {
  if (face === 'serif') {
    if (!bold && italic) return 'PlayfairDisplay_400Regular_Italic'
    return italic
      ? 'PlayfairDisplay_600SemiBold_Italic'
      : 'PlayfairDisplay_600SemiBold'
  }
  if (bold) return italic ? 'Inter_600SemiBold_Italic' : 'Inter_600SemiBold'
  return italic ? 'Inter_400Regular_Italic' : 'Inter_400Regular'
}
