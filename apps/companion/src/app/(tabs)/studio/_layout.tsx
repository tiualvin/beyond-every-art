import { Stack } from 'expo-router'

import { tabStackOptions } from '../../../stack-options'

export default function StudioStack() {
  return (
    <Stack screenOptions={tabStackOptions}>
      <Stack.Screen name="index" options={{ title: 'Studio' }} />
    </Stack>
  )
}
