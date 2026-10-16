import type { NativeStackNavigationOptions } from 'expo-router'
import { Platform } from 'react-native'

import { familyFor } from './theme/fonts'

/**
 * A tab's own stack: large titles on iOS, the standard bar on Android. On iOS 26
 * the bar is Liquid Glass by the system's hand, which also honours Reduce
 * Transparency on the reader's behalf.
 */
export const tabStackOptions: NativeStackNavigationOptions = {
  headerLargeTitle: Platform.OS === 'ios',
  headerLargeTitleStyle: { fontFamily: familyFor('serif') },
  headerTitleStyle: { fontFamily: familyFor('serif') },
  headerShadowVisible: false,
}
