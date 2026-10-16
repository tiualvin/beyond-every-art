// The five tabs from the handoff. Native tabs: on iOS 26 the system draws them
// in Liquid Glass and honours Reduce Transparency itself; earlier iOS and
// Android get their own platform's tab bar. Five is also Android's limit.

import { NativeTabs } from 'expo-router/native-tabs'

import { useTheme } from '../../theme/theme'

export default function TabLayout() {
  const { palette } = useTheme()
  return (
    <NativeTabs tintColor={palette.accent}>
      <NativeTabs.Trigger name="today">
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'sun.max', selected: 'sun.max.fill' }}
          md="today"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="read">
        <NativeTabs.Trigger.Label>Read</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'book', selected: 'book.fill' }}
          md="menu_book"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="explore">
        <NativeTabs.Trigger.Label>Explore</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' }}
          md="explore"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="studio">
        <NativeTabs.Trigger.Label>Studio</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'paintpalette', selected: 'paintpalette.fill' }}
          md="palette"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="library">
        <NativeTabs.Trigger.Label>Library</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'bookmark', selected: 'bookmark.fill' }}
          md="bookmarks"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  )
}
