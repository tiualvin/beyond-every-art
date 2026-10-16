import { useLocalSearchParams } from 'expo-router'

import { TagScreen } from '../../screens/archive'

export default function TagRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  return <TagScreen slug={slug} />
}
