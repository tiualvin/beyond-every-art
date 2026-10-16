import { Pressable, ScrollView, Share, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import type { PostDetail } from '../api/contract'
import { MAX_CONTENT_WIDTH } from '../components/screen'
import { EmptyState, ErrorState, Loading, Notice } from '../components/states'
import {
  useIsBookmarked,
  useIsSaved,
  usePost,
  useRemoveSaved,
  useSaveForOffline,
  useToggleBookmark,
} from '../data/hooks'
import { useServices } from '../data/services'
import { summaryOf } from '../library/validate'
import { Article } from '../reader/article'
import { useOpenExternal } from '../reader/link-context'
import { Button } from '../theme/button'
import { ChromeSurface } from '../theme/chrome'
import { Txt } from '../theme/text'
import { useTheme } from '../theme/theme'
import { MIN_TOUCH, space } from '../theme/typography'

function Action({
  label,
  selected,
  onPress,
  accessibilityLabel,
}: {
  label: string
  selected?: boolean
  onPress: () => void
  accessibilityLabel?: string
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}
    >
      <Txt variant="label" tone={selected ? 'accent' : 'text'}>
        {label}
      </Txt>
    </Pressable>
  )
}

/** The reader's controls, on the app's navigation chrome. */
function ActionBar({ post }: { post: PostDetail }) {
  const { usingFixtures } = useServices()
  const openExternal = useOpenExternal()
  const insets = useSafeAreaInsets()
  const bookmarked = useIsBookmarked(post.slug).data ?? false
  const saved = useIsSaved(post.slug).data ?? false
  const toggleBookmark = useToggleBookmark()
  const save = useSaveForOffline()
  const remove = useRemoveSaved()

  return (
    <ChromeSurface
      style={[styles.bar, { bottom: Math.max(insets.bottom, space.md) }]}
    >
      <Action
        label={bookmarked ? 'Bookmarked' : 'Bookmark'}
        selected={bookmarked}
        accessibilityLabel="Bookmark"
        onPress={() =>
          toggleBookmark.mutate({ post: summaryOf(post), bookmarked })
        }
      />
      <Action
        label={saved ? 'Saved offline' : 'Save offline'}
        selected={saved}
        accessibilityLabel="Save for offline reading"
        onPress={() => (saved ? remove.mutate(post.slug) : save.mutate(post))}
      />
      {usingFixtures ? null : (
        <>
          <Action
            label="Share"
            onPress={() =>
              void Share.share({ url: post.href, message: post.href })
            }
          />
          <Action
            label="Website"
            accessibilityLabel="Open on the website"
            onPress={() => openExternal(post.href)}
          />
        </>
      )}
    </ChromeSurface>
  )
}

export function ArticleScreen({ slug }: { slug: string }) {
  const { palette } = useTheme()
  const { siteUrl } = useServices()
  const openExternal = useOpenExternal()
  const read = usePost(slug)

  if (read.isPending) {
    return (
      <View style={[styles.fill, { backgroundColor: palette.background }]}>
        <Loading label="Loading the article" />
      </View>
    )
  }

  if (read.isError) {
    return (
      <ScrollView
        style={{ backgroundColor: palette.background }}
        contentContainerStyle={styles.page}
      >
        <ErrorState error={read.error} onRetry={() => read.refetch()} />
        <Txt tone="muted">
          Articles you save for offline open without a connection.
        </Txt>
      </ScrollView>
    )
  }

  const { data } = read
  if (!data.post) {
    return (
      <ScrollView
        style={{ backgroundColor: palette.background }}
        contentContainerStyle={styles.page}
      >
        <EmptyState
          title="Not an article in the app"
          body="This link goes to a page on the website rather than to an article."
        />
        <Button
          label="Open on the website"
          hint="Opens in your browser"
          onPress={() =>
            openExternal(`${siteUrl}/${encodeURIComponent(slug)}/`)
          }
          style={styles.start}
        />
      </ScrollView>
    )
  }

  return (
    <View style={[styles.fill, { backgroundColor: palette.background }]}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.page, styles.withBar]}
      >
        <View style={styles.column}>
          {data.source === 'saved' ? (
            <Notice>
              {data.goneFromWebsite
                ? 'This article is no longer on the website. This is your saved copy.'
                : 'You are reading the copy saved on this device.'}
            </Notice>
          ) : null}
          <Article post={data.post} />
        </View>
      </ScrollView>
      <ActionBar post={data.post} />
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: { padding: space.md, gap: space.md },
  withBar: { paddingBottom: 120 },
  column: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    gap: space.md,
  },
  bar: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: space.xs,
    paddingHorizontal: space.sm,
  },
  action: {
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
  pressed: { opacity: 0.6 },
  start: { alignSelf: 'flex-start' },
})
