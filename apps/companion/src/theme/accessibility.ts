// The reader's system accessibility settings, kept current.

import { useEffect, useState } from 'react'
import { AccessibilityInfo, Platform } from 'react-native'

export type AccessibilityPreferences = {
  reduceMotion: boolean
  reduceTransparency: boolean
  /** iOS Increase Contrast, or Android high-contrast text. */
  increaseContrast: boolean
}

export const DEFAULT_PREFERENCES: AccessibilityPreferences = {
  reduceMotion: false,
  reduceTransparency: false,
  increaseContrast: false,
}

const contrastEvent =
  Platform.OS === 'ios'
    ? 'darkerSystemColorsChanged'
    : 'highTextContrastChanged'

function readContrast(): Promise<boolean> {
  return Platform.OS === 'ios'
    ? AccessibilityInfo.isDarkerSystemColorsEnabled()
    : AccessibilityInfo.isHighTextContrastEnabled()
}

export function useAccessibilityPreferences(): AccessibilityPreferences {
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES)

  useEffect(() => {
    let active = true
    const set = (patch: Partial<AccessibilityPreferences>) => {
      if (active) setPreferences((current) => ({ ...current, ...patch }))
    }
    const ignore = () => undefined

    AccessibilityInfo.isReduceMotionEnabled().then(
      (reduceMotion) => set({ reduceMotion }),
      ignore,
    )
    if (Platform.OS === 'ios') {
      AccessibilityInfo.isReduceTransparencyEnabled().then(
        (reduceTransparency) => set({ reduceTransparency }),
        ignore,
      )
    }
    readContrast().then((increaseContrast) => set({ increaseContrast }), ignore)

    const subscriptions = [
      AccessibilityInfo.addEventListener(
        'reduceMotionChanged',
        (reduceMotion) => set({ reduceMotion }),
      ),
      AccessibilityInfo.addEventListener(
        'reduceTransparencyChanged',
        (reduceTransparency) => set({ reduceTransparency }),
      ),
      AccessibilityInfo.addEventListener(contrastEvent, (increaseContrast) =>
        set({ increaseContrast }),
      ),
    ]
    return () => {
      active = false
      for (const subscription of subscriptions) subscription.remove()
    }
  }, [])

  return preferences
}
