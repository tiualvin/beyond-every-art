// Where an image should have been: the website's plate wash.
//
// The website's own rule (app/globals.css, --plate-wash): a missing featured
// image gets one burgundy wash, the same everywhere, because "every article
// here is meant to carry an image, and a missing one is an omission to go and
// fix". This draws the same 148° three-stop gradient from the same tokens.
//
// It is for an image that failed or is absent, never for one still loading:
// a loading image sits on the quiet `line` colour, so the wash does not flash
// across every screen while pictures arrive.

import { LinearGradient } from 'expo-linear-gradient'
import { StyleSheet } from 'react-native'

import { useTheme } from '../theme/theme'

/** CSS's 148deg, as start and end points in a unit square. */
const ANGLE = (148 * Math.PI) / 180
const DX = Math.sin(ANGLE) / 2
const DY = -Math.cos(ANGLE) / 2
export const PLATE_START = { x: 0.5 - DX, y: 0.5 - DY }
export const PLATE_END = { x: 0.5 + DX, y: 0.5 + DY }
export const PLATE_STOPS = [0, 0.55, 1] as const

export function PlateWash() {
  const { palette } = useTheme()
  return (
    <LinearGradient
      colors={palette.plate}
      locations={PLATE_STOPS}
      start={PLATE_START}
      end={PLATE_END}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      testID="plate-wash"
    />
  )
}
