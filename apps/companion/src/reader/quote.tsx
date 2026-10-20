// A block quotation, drawn the way the website draws one.
//
// The website's `.prose blockquote` (app/globals.css): centred serif italic
// between two hairlines, under a burgundy opening quotation mark, with room
// above and below — a quotation set apart from the argument around it, not a
// second heading and not an indented paragraph. Rich text and migrated HTML
// both come through here, so the two kinds of article agree.

import { createContext, useContext, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'

import { Txt } from '../theme/text'
import { useTheme } from '../theme/theme'
import { space } from '../theme/typography'

/**
 * Whether the text being drawn is inside a quotation. Migrated HTML nests
 * paragraphs inside `<blockquote>`, and those paragraphs have to know.
 */
const InQuote = createContext(false)

export const useInQuote = () => useContext(InQuote)

/** Centred, as the website sets a quotation; applied to each run inside. */
export const quoteText = { textAlign: 'center' } as const

export function QuoteFrame({ children }: { children: ReactNode }) {
  const { palette } = useTheme()
  return (
    <View style={[styles.frame, { borderColor: palette.line }]}>
      {/* Decorative: the words are the quotation, the mark is typography. */}
      <Txt
        variant="quoteMark"
        tone="accent"
        style={quoteText}
        accessible={false}
        importantForAccessibility="no"
        accessibilityElementsHidden
      >
        {'“'}
      </Txt>
      <View style={styles.words}>
        <InQuote.Provider value>{children}</InQuote.Provider>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  frame: {
    marginVertical: space.xl,
    paddingVertical: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 576,
  },
  // Migrated quotations can hold several paragraphs; they are spaced by the
  // gap, so the last one does not push the closing rule away.
  words: { gap: space.sm },
})
