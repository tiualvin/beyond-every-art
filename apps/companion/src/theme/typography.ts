// The app's text styles, by role rather than by size.
//
// Hierarchy comes from weight and face as much as from size: semibold Playfair
// for the few things that lead a screen, medium for headlines in a list,
// regular for a standfirst, and Inter for everything that is interface rather
// than editorial. The editorial ladder steps by about a fifth (body 17, h3 20,
// h2 24, title 28, display 34), so two neighbouring levels never read as one;
// h4 shares body's size and is told apart by face, and the interface sizes
// (12 to 15) sit below the ladder. Headings are set a little tight the way the
// website sets them (letter-spacing below zero, leading near 1.15).
//
// Sizes are points before Dynamic Type. Every Text in the app scales with the
// reader's system text size; each role names the iOS text style whose curve it
// follows, so a headline grows the way a headline does and not the way body
// text does. Nothing here turns scaling off.

import { Platform, type TextStyle } from 'react-native'

import { familyFor, type SerifWeight } from './fonts'

/** The iOS Dynamic Type curve a role follows. */
export type Ramp =
  | 'caption2'
  | 'caption1'
  | 'footnote'
  | 'subheadline'
  | 'callout'
  | 'body'
  | 'headline'
  | 'title3'
  | 'title2'
  | 'title1'
  | 'largeTitle'

export type TypeSpec = {
  face: 'serif' | 'sans' | 'mono'
  /** Serif only: Playfair's weight. Inter is 400, or 600 when `strong`. */
  weight?: SerifWeight
  strong?: boolean
  italic?: boolean
  size: number
  line: number
  tracking?: number
  upper?: boolean
  /** Dates, counts and codes line up in columns. */
  tabular?: boolean
  /** Headlines break into even lines rather than leaving one word behind. */
  balance?: boolean
  ramp: Ramp
}

const SPECS = {
  /** What leads: Today's lead and an article's own title. */
  display: {
    face: 'serif',
    weight: 600,
    size: 34,
    line: 38,
    tracking: -0.6,
    balance: true,
    ramp: 'largeTitle',
  },
  /** A topic's or an author's page, and an h1 inside a body. */
  title: {
    face: 'serif',
    weight: 600,
    size: 28,
    line: 32,
    tracking: -0.5,
    balance: true,
    ramp: 'title1',
  },
  h2: {
    face: 'serif',
    weight: 600,
    size: 24,
    line: 28,
    tracking: -0.4,
    balance: true,
    ramp: 'title2',
  },
  /** Section headings inside a body, and the title of a card. */
  h3: {
    face: 'serif',
    weight: 500,
    size: 20,
    line: 24,
    tracking: -0.3,
    balance: true,
    ramp: 'title3',
  },
  h4: {
    face: 'serif',
    weight: 500,
    size: 17,
    line: 22,
    tracking: -0.2,
    balance: true,
    ramp: 'headline',
  },
  h5: { face: 'sans', strong: true, size: 17, line: 22, ramp: 'headline' },
  h6: { face: 'sans', strong: true, size: 14, line: 20, ramp: 'subheadline' },
  /** An article's headline in a list. */
  rowTitle: {
    face: 'serif',
    weight: 500,
    size: 19,
    line: 23,
    tracking: -0.3,
    balance: true,
    ramp: 'title3',
  },
  /** The standfirst: the serif's quieter voice, not the interface's. */
  standfirst: {
    face: 'serif',
    weight: 400,
    size: 20,
    line: 28,
    tracking: -0.1,
    ramp: 'title3',
  },
  body: { face: 'sans', size: 17, line: 28, ramp: 'body' },
  /** A short passage in a list or a card: smaller than reading text. */
  summary: { face: 'sans', size: 15, line: 21, ramp: 'subheadline' },
  quote: {
    face: 'serif',
    weight: 400,
    italic: true,
    size: 20,
    line: 30,
    ramp: 'title3',
  },
  /** The opening quotation mark over a block quotation. */
  quoteMark: {
    face: 'serif',
    weight: 400,
    italic: true,
    size: 40,
    line: 40,
    ramp: 'largeTitle',
  },
  meta: { face: 'sans', size: 14, line: 20, tabular: true, ramp: 'footnote' },
  /** Interface text: buttons, chips, controls. */
  label: {
    face: 'sans',
    strong: true,
    size: 15,
    line: 20,
    ramp: 'subheadline',
  },
  /**
   * A call to action inside an article, as the website sets its `.button`:
   * small, uppercase and tracked. Interface buttons stay in sentence case.
   */
  action: {
    face: 'sans',
    strong: true,
    size: 13,
    line: 18,
    tracking: 1.3,
    upper: true,
    ramp: 'footnote',
  },
  /** The topic over an article's title. */
  kicker: {
    face: 'sans',
    strong: true,
    size: 12,
    line: 16,
    tracking: 1.2,
    upper: true,
    ramp: 'caption1',
  },
  /**
   * What names a group of rows — Latest, Topics, Saved. Small and set apart,
   * so it never competes with the headlines it introduces. Used on list
   * groups only: an eyebrow over every serif title is a pattern the product
   * brief rules out.
   */
  section: {
    face: 'sans',
    strong: true,
    size: 12,
    line: 16,
    tracking: 1.4,
    upper: true,
    tabular: true,
    ramp: 'caption1',
  },
  /** An empty state's title: interface copy, so not the editorial serif. */
  emptyTitle: {
    face: 'sans',
    strong: true,
    size: 17,
    line: 22,
    ramp: 'headline',
  },
  code: { face: 'mono', size: 15, line: 24, ramp: 'callout' },
} satisfies Record<string, TypeSpec>

export type TypeVariant = keyof typeof SPECS

export const TYPE_SPECS: Record<TypeVariant, TypeSpec> = SPECS

/** Inline code: the platform's own monospace. */
export const MONOSPACE = Platform.select({
  ios: 'Menlo',
  default: 'monospace',
})

/** The font family a role sets its text in, with a run's own bold or italic. */
export function familyOf(
  spec: TypeSpec,
  run: { bold?: boolean; italic?: boolean } = {},
): string {
  if (spec.face === 'mono') return MONOSPACE
  const italic = Boolean(spec.italic || run.italic)
  return spec.face === 'serif'
    ? familyFor('serif', { weight: spec.weight, bold: run.bold, italic })
    : familyFor('sans', { bold: Boolean(spec.strong || run.bold), italic })
}

function styleOf(spec: TypeSpec): TextStyle {
  return {
    fontFamily: familyOf(spec),
    fontSize: spec.size,
    lineHeight: spec.line,
    ...(spec.tracking ? { letterSpacing: spec.tracking } : {}),
    ...(spec.upper ? { textTransform: 'uppercase' as const } : {}),
    ...(spec.tabular ? { fontVariant: ['tabular-nums' as const] } : {}),
  }
}

/** Each role as a style, for the few places that need one outside Txt. */
export const type = Object.fromEntries(
  Object.entries(SPECS).map(([name, spec]) => [name, styleOf(spec)]),
) as Record<TypeVariant, TextStyle>

/**
 * The most a headline grows with the system text size on Android, where there
 * are no per-style curves: enough to read, never a word to a line.
 */
export const HEADLINE_MAX_SCALE = 1.6

/** The smallest a touch target gets: Apple's 44pt, Material's 48dp. */
export const MIN_TOUCH = Platform.select({ android: 48, default: 44 })

/** A control's shape: a capsule, as both platforms draw buttons and chips. */
export const CAPSULE = 999

export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  /** Between the sections of a screen. */
  xxl: 48,
  xxxl: 64,
} as const
