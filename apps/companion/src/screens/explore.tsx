import { useRouter } from 'expo-router'
import { Pressable, StyleSheet, View } from 'react-native'

import { Screen } from '../components/screen'
import { EmptyState, ErrorState, Loading } from '../components/states'
import { useAuthors, useTags } from '../data/hooks'
import { Txt } from '../theme/text'
import { useTheme } from '../theme/theme'
import { MIN_TOUCH, space } from '../theme/typography'

function Row({
  title,
  detail,
  onPress,
}: {
  title: string
  detail: string
  onPress: () => void
}) {
  const { palette } = useTheme()
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${title}, ${detail}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderColor: palette.line },
        pressed && styles.pressed,
      ]}
    >
      <Txt variant="label" style={styles.flex}>
        {title}
      </Txt>
      <Txt variant="meta" tone="muted">
        {detail}
      </Txt>
    </Pressable>
  )
}

const articles = (count: number) =>
  `${count} ${count === 1 ? 'article' : 'articles'}`

/**
 * Topics and authors: what the website has collections for today. Artists,
 * artworks, pigments and the rest arrive with their collections, and until
 * then the screen says so instead of showing anything made up.
 */
export function ExploreScreen() {
  const router = useRouter()
  const tags = useTags()
  const authors = useAuthors()

  return (
    <Screen>
      <View>
        <Txt variant="h3" accessibilityRole="header">
          Topics
        </Txt>
        {tags.isPending ? (
          <Loading label="Loading topics" />
        ) : tags.isError ? (
          <ErrorState error={tags.error} onRetry={() => tags.refetch()} />
        ) : (
          tags.data.tags.map((tag) => (
            <Row
              key={tag.slug}
              title={tag.name}
              detail={articles(tag.postCount)}
              onPress={() =>
                router.push({
                  pathname: '/tag/[slug]',
                  params: { slug: tag.slug },
                })
              }
            />
          ))
        )}
      </View>
      <View>
        <Txt variant="h3" accessibilityRole="header">
          Authors
        </Txt>
        {authors.isPending ? (
          <Loading label="Loading authors" />
        ) : authors.isError ? (
          <ErrorState error={authors.error} onRetry={() => authors.refetch()} />
        ) : (
          authors.data.authors
            .filter((author) => author.slug)
            .map((author) => (
              <Row
                key={author.slug}
                title={author.name}
                detail={articles(author.postCount)}
                onPress={() =>
                  router.push({
                    pathname: '/author/[slug]',
                    params: { slug: author.slug! },
                  })
                }
              />
            ))
        )}
      </View>
      <EmptyState
        title="More to explore later"
        body="Artists, artworks, pigments, materials and exhibitions will appear here once the website has collections for them."
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  row: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
})
