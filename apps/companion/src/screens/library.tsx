import { View } from 'react-native'

import { PostRow } from '../components/post-row'
import { Screen } from '../components/screen'
import { EmptyState, Loading, Notice } from '../components/states'
import {
  useBookmarks,
  useRemoveSaved,
  useSavedArticles,
  useToggleBookmark,
} from '../data/hooks'
import { useServices } from '../data/services'
import { Button } from '../theme/button'
import { Txt } from '../theme/text'
import { space } from '../theme/typography'

/** What the reader keeps, on this device: saved articles and bookmarks. */
export function LibraryScreen() {
  const { libraryPersistent } = useServices()
  const saved = useSavedArticles()
  const bookmarks = useBookmarks()
  const removeSaved = useRemoveSaved()
  const toggleBookmark = useToggleBookmark()

  return (
    <Screen>
      {libraryPersistent ? null : (
        <Notice>
          Your library could not be stored on this device. What you save lasts
          until the app closes.
        </Notice>
      )}
      <View style={{ gap: space.xs }}>
        <Txt variant="section" tone="muted" accessibilityRole="header">
          Saved for offline
        </Txt>
        {saved.isPending ? (
          <Loading label="Loading saved articles" />
        ) : !saved.data?.length ? (
          <EmptyState
            title="Nothing saved yet"
            body="Save an article from its page to read it without a connection."
          />
        ) : (
          saved.data.map(({ post }) => (
            <View key={post.slug}>
              <PostRow post={post} />
              <Button
                label="Remove"
                variant="secondary"
                accessibilityLabel={`Remove the saved copy of ${post.title}`}
                onPress={() => removeSaved.mutate(post.slug)}
                style={{ alignSelf: 'flex-start' }}
              />
            </View>
          ))
        )}
      </View>
      <View style={{ gap: space.xs }}>
        <Txt variant="section" tone="muted" accessibilityRole="header">
          Bookmarks
        </Txt>
        {bookmarks.isPending ? (
          <Loading label="Loading bookmarks" />
        ) : !bookmarks.data?.length ? (
          <EmptyState
            title="No bookmarks yet"
            body="Bookmark an article to find it here."
          />
        ) : (
          bookmarks.data.map(({ post }) => (
            <View key={post.slug}>
              <PostRow post={post} />
              <Button
                label="Remove"
                variant="secondary"
                accessibilityLabel={`Remove the bookmark for ${post.title}`}
                onPress={() =>
                  toggleBookmark.mutate({ post, bookmarked: true })
                }
                style={{ alignSelf: 'flex-start' }}
              />
            </View>
          ))
        )}
      </View>
    </Screen>
  )
}
