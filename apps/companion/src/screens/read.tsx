import { useRouter } from 'expo-router'
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native'

import { PostRow } from '../components/post-row'
import { MAX_CONTENT_WIDTH } from '../components/screen'
import { SectionHeader } from '../components/section'
import { EmptyState, ErrorState, Loading } from '../components/states'
import { usePostsFeed, useTags } from '../data/hooks'
import { Capsule, pressedStyle } from '../theme/button'
import { Txt } from '../theme/text'
import { useTheme } from '../theme/theme'
import { CAPSULE, MIN_TOUCH, space } from '../theme/typography'
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
    <Capsule>
      <Pressable
        accessibilityRole="link"
        onPress={onPress}
        android_ripple={{ color: `${palette.onTonal}33` }}
        style={({ pressed }) => [
          styles.chip,
          { backgroundColor: palette.tonal },
          pressedStyle(pressed),
        ]}
      >
        <Txt variant="label" style={{ color: palette.onTonal }}>
          {label}
        </Txt>
      </Pressable>
    </Capsule>
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
          { borderColor: palette.field, backgroundColor: palette.surface },
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
            style={styles.chipRow}
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
    paddingHorizontal: space.md + space.xs,
    borderWidth: 1,
    borderRadius: CAPSULE,
  },
  topics: { gap: space.sm },
  // The row scrolls under the screen's edge rather than stopping short of it,
  // so a cut-off chip says there is more; it starts and ends on the margin.
  chipRow: { marginHorizontal: -space.md },
  chips: { gap: space.sm, paddingHorizontal: space.md },
  chip: {
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  pressed: { opacity: 0.7 },
})
