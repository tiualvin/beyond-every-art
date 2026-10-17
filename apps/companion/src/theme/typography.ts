// Type sizes, in points before Dynamic Type. Every Text in the app scales with
// the reader's system text size; nothing here turns that off.

import type { TextStyle } from 'react-native'

import { familyFor } from './fonts'

export const type = {
  display: { fontFamily: familyFor('serif'), fontSize: 32, lineHeight: 38 },
  title: { fontFamily: familyFor('serif'), fontSize: 28, lineHeight: 34 },
  h2: { fontFamily: familyFor('serif'), fontSize: 24, lineHeight: 30 },
  h3: { fontFamily: familyFor('serif'), fontSize: 21, lineHeight: 27 },
  h4: { fontFamily: familyFor('serif'), fontSize: 19, lineHeight: 25 },
  h5: {
    fontFamily: familyFor('sans', { bold: true }),
    fontSize: 17,
    lineHeight: 24,
  },
  h6: {
    fontFamily: familyFor('sans', { bold: true }),
    fontSize: 15,
    lineHeight: 22,
  },
  standfirst: { fontFamily: familyFor('sans'), fontSize: 19, lineHeight: 28 },
  body: { fontFamily: familyFor('sans'), fontSize: 17, lineHeight: 28 },
  quote: {
    fontFamily: familyFor('serif', { italic: true }),
    fontSize: 22,
    lineHeight: 31,
  },
  /** The opening quotation mark over a block quotation. */
  quoteMark: {
    fontFamily: familyFor('serif', { italic: true }),
    fontSize: 40,
    lineHeight: 40,
  },
  meta: { fontFamily: familyFor('sans'), fontSize: 14, lineHeight: 20 },
  label: {
    fontFamily: familyFor('sans', { bold: true }),
    fontSize: 15,
    lineHeight: 20,
  },
  /** The kicker over an article title, and nowhere else. */
  kicker: {
    fontFamily: familyFor('sans', { bold: true }),
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  code: { fontFamily: 'Courier', fontSize: 15, lineHeight: 24 },
} satisfies Record<string, TextStyle>

export type TypeVariant = keyof typeof type

/** The smallest a touch target gets, in points. */
export const MIN_TOUCH = 44

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const
