// Playfair Display and Inter, the website's pairing, bundled with the app.
//
// Loaded from the files inside @expo-google-fonts, one weight per import so
// only these ship; nothing is fetched at runtime. A custom family has no
// synthetic bold or italic on Android, so every weight and style the reader
// uses is a family of its own.
//
// Playfair comes in three weights because hierarchy needs them: semibold for
// what leads a screen, medium for headlines in a list, regular for a
// standfirst and for quotations. With one weight every serif line was the
// same dark block, and only size was left to tell them apart.

import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular'
import { Inter_400Regular_Italic } from '@expo-google-fonts/inter/400Regular_Italic'
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold'
import { Inter_600SemiBold_Italic } from '@expo-google-fonts/inter/600SemiBold_Italic'
import { PlayfairDisplay_400Regular } from '@expo-google-fonts/playfair-display/400Regular'
import { PlayfairDisplay_400Regular_Italic } from '@expo-google-fonts/playfair-display/400Regular_Italic'
import { PlayfairDisplay_500Medium } from '@expo-google-fonts/playfair-display/500Medium'
import { PlayfairDisplay_500Medium_Italic } from '@expo-google-fonts/playfair-display/500Medium_Italic'
import { PlayfairDisplay_600SemiBold } from '@expo-google-fonts/playfair-display/600SemiBold'
import { PlayfairDisplay_600SemiBold_Italic } from '@expo-google-fonts/playfair-display/600SemiBold_Italic'

export const FONT_ASSETS = {
  Inter_400Regular,
  Inter_400Regular_Italic,
  Inter_600SemiBold,
  Inter_600SemiBold_Italic,
  PlayfairDisplay_400Regular,
  PlayfairDisplay_400Regular_Italic,
  PlayfairDisplay_500Medium,
  PlayfairDisplay_500Medium_Italic,
  PlayfairDisplay_600SemiBold,
  PlayfairDisplay_600SemiBold_Italic,
} as const

export type FontFamily = keyof typeof FONT_ASSETS

export type SerifWeight = 400 | 500 | 600

const SERIF: Record<SerifWeight, [FontFamily, FontFamily]> = {
  400: ['PlayfairDisplay_400Regular', 'PlayfairDisplay_400Regular_Italic'],
  500: ['PlayfairDisplay_500Medium', 'PlayfairDisplay_500Medium_Italic'],
  600: ['PlayfairDisplay_600SemiBold', 'PlayfairDisplay_600SemiBold_Italic'],
}

/**
 * The family for a run of text.
 *
 * A serif run is set at its role's weight, and bold within it is semibold, the
 * heaviest Playfair here. Without a weight, roman serif is semibold — the
 * headline weight — and italic serif is regular, the quotation weight.
 */
export function familyFor(
  face: 'serif' | 'sans',
  {
    bold = false,
    italic = false,
    weight,
  }: { bold?: boolean; italic?: boolean; weight?: SerifWeight } = {},
): FontFamily {
  if (face === 'serif') {
    const base = weight ?? (italic ? 400 : 600)
    const [roman, slanted] = SERIF[bold ? 600 : base]
    return italic ? slanted : roman
  }
  if (bold) return italic ? 'Inter_600SemiBold_Italic' : 'Inter_600SemiBold'
  return italic ? 'Inter_400Regular_Italic' : 'Inter_400Regular'
}
