import { Stack } from 'expo-router'

import { tabStackOptions } from '../../../stack-options'

export default function TodayStack() {
  return (
    <Stack screenOptions={tabStackOptions}>
      <Stack.Screen name="index" options={{ title: 'Today' }} />
    </Stack>
  )
}
