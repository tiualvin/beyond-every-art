import { useRouter } from 'expo-router'
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native'

import { PostRow } from '../components/post-row'
import { MAX_CONTENT_WIDTH } from '../components/screen'
import { SectionHeader } from '../components/section'
import { EmptyState, ErrorState, Loading } from '../components/states'
import { usePostsFeed, useTags } from '../data/hooks'
import { Txt } from '../theme/text'
import { useTheme } from '../theme/theme'
import { MIN_TOUCH, space } from '../theme/typography'
import { FixtureNotice } from './today'

export function Chip({
  label,
  onPress,
}: {
  label: string
  onPress: () => void
}) {
  const { palette } = useTheme()
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        { borderColor: palette.rule, backgroundColor: palette.surface },
        pressed && styles.pressed,
      ]}
    >
      <Txt variant="label">{label}</Txt>
    </Pressable>
  )
}

function ReadHeader() {
  const router = useRouter()
  const { palette } = useTheme()
  const tags = useTags()
  return (
    <View style={styles.header}>
      <FixtureNotice />
      <Pressable
        accessibilityRole="search"
        accessibilityLabel="Search articles"
        onPress={() => router.push('/read/search')}
        style={({ pressed }) => [
          styles.search,
          { borderColor: palette.rule, backgroundColor: palette.surface },
          pressed && styles.pressed,
        ]}
      >
        <Txt tone="muted">Search articles</Txt>
      </Pressable>
      {tags.data && tags.data.tags.length > 0 ? (
        <View style={styles.topics}>
          <SectionHeader label="Topics" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            {tags.data.tags.map((tag) => (
              <Chip
                key={tag.slug}
                label={tag.name}
                onPress={() =>
                  router.push({
                    pathname: '/tag/[slug]',
                    params: { slug: tag.slug },
                  })
                }
              />
            ))}
          </ScrollView>
        </View>
      ) : null}
      <SectionHeader label="Newest" style={styles.newest} />
    </View>
  )
}

export function ReadScreen() {
  const { palette } = useTheme()
  const feed = usePostsFeed()
  const posts = feed.data?.pages.flatMap((page) => page.posts) ?? []

  return (
    <FlatList
      style={{ backgroundColor: palette.background }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.list}
      data={posts}
      keyExtractor={(post) => post.slug}
      renderItem={({ item, index }) => (
        <PostRow post={item} divider={index > 0} />
      )}
      ListHeaderComponent={ReadHeader}
      ListEmptyComponent={
        feed.isPending ? (
          <Loading label="Loading articles" />
        ) : feed.isError ? (
          <ErrorState error={feed.error} onRetry={() => feed.refetch()} />
        ) : (
          <EmptyState title="Nothing published yet" />
        )
      }
      ListFooterComponent={
        feed.isFetchingNextPage ? <Loading label="Loading more" /> : undefined
      }
      onEndReached={() => {
        if (feed.hasNextPage && !feed.isFetchingNextPage)
          void feed.fetchNextPage()
      }}
      onEndReachedThreshold={0.5}
      refreshing={feed.isRefetching && !feed.isFetchingNextPage}
      onRefresh={() => feed.refetch()}
    />
  )
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: space.md,
    paddingBottom: space.xl,
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
  },
  header: { gap: space.lg, paddingTop: space.md },
  newest: { marginTop: space.lg },
  search: {
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderWidth: 1,
    borderRadius: 2,
  },
  topics: { gap: space.sm },
  chips: { gap: space.sm },
  chip: {
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderWidth: 1,
    borderRadius: 999,
  },
  pressed: { opacity: 0.7 },
})
