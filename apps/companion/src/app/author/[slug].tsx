import { useLocalSearchParams } from 'expo-router'

import { AuthorScreen } from '../../screens/archive'

export default function AuthorRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  return <AuthorScreen slug={slug} />
}
