import { Stack } from 'expo-router'

import { tabStackOptions } from '../../../stack-options'

export default function ReadStack() {
  return (
    <Stack screenOptions={tabStackOptions}>
      <Stack.Screen name="index" options={{ title: 'Read' }} />
      <Stack.Screen
        name="search"
        options={{ title: 'Search', headerLargeTitle: false }}
      />
    </Stack>
  )
}
