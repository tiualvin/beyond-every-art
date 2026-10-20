import { useRouter } from 'expo-router'
import { Pressable, StyleSheet } from 'react-native'

import { Screen } from '../components/screen'
import { Section } from '../components/section'
import { EmptyState, ErrorState, Loading } from '../components/states'
import { useAuthors, useTags } from '../data/hooks'
import { Txt } from '../theme/text'
import { useTheme } from '../theme/theme'
import { space } from '../theme/typography'

function Row({
  title,
  detail,
  onPress,
  divider,
}: {
  title: string
  detail: string
  onPress: () => void
  divider: boolean
}) {
  const { palette } = useTheme()
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${title}, ${detail}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        divider && [styles.divided, { borderColor: palette.line }],
        pressed && styles.pressed,
      ]}
    >
      <Txt variant="rowTitle" style={styles.flex}>
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
    <Screen spacing="sections">
      <Section label="Topics">
        {tags.isPending ? (
          <Loading label="Loading topics" />
        ) : tags.isError ? (
          <ErrorState error={tags.error} onRetry={() => tags.refetch()} />
        ) : (
          tags.data.tags.map((tag, index) => (
            <Row
              key={tag.slug}
              divider={index > 0}
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
      </Section>
      <Section label="Authors">
        {authors.isPending ? (
          <Loading label="Loading authors" />
        ) : authors.isError ? (
          <ErrorState error={authors.error} onRetry={() => authors.refetch()} />
        ) : (
          authors.data.authors
            .filter((author) => author.slug)
            .map((author, index) => (
              <Row
                key={author.slug}
                divider={index > 0}
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
      </Section>
      <EmptyState
        title="More to explore later"
        body="Artists, artworks, pigments, materials and exhibitions will appear here once the website has collections for them."
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.md - 2,
  },
  divided: { borderTopWidth: StyleSheet.hairlineWidth },
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
})
