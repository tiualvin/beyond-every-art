import { useLocalSearchParams } from 'expo-router'

import { ArticleScreen } from '../../screens/article'

export default function ArticleRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  return <ArticleScreen slug={slug} />
}
