import { useRouter } from 'expo-router'
import { View } from 'react-native'

import { PostRow } from '../components/post-row'
import { Screen } from '../components/screen'
import { Section } from '../components/section'
import { EmptyState, Loading, Notice } from '../components/states'
import {
  useBookmarks,
  useRemoveSaved,
  useSavedArticles,
  useToggleBookmark,
} from '../data/hooks'
import { useServices } from '../data/services'
import { Button } from '../theme/button'

/** What the reader keeps, on this device: saved articles and bookmarks. */
export function LibraryScreen() {
  const router = useRouter()
  const { libraryPersistent } = useServices()
  const saved = useSavedArticles()
  const bookmarks = useBookmarks()
  const removeSaved = useRemoveSaved()
  const toggleBookmark = useToggleBookmark()

  return (
    <Screen spacing="sections">
      {libraryPersistent ? null : (
        <Notice>
          Your library could not be stored on this device. What you save lasts
          until the app closes.
        </Notice>
      )}
      <Section label="Saved for offline">
        {saved.isPending ? (
          <Loading label="Loading saved articles" />
        ) : !saved.data?.length ? (
          <EmptyState
            title="Nothing saved yet"
            body="Save an article from its page to read it without a connection."
            action={{
              label: 'Find something to read',
              onPress: () => router.navigate('/read'),
            }}
          />
        ) : (
          saved.data.map(({ post }, index) => (
            <View key={post.slug}>
              <PostRow post={post} divider={index > 0} />
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
      </Section>
      <Section label="Bookmarks">
        {bookmarks.isPending ? (
          <Loading label="Loading bookmarks" />
        ) : !bookmarks.data?.length ? (
          <EmptyState
            title="No bookmarks yet"
            body="Bookmark an article to find it here."
          />
        ) : (
          bookmarks.data.map(({ post }, index) => (
            <View key={post.slug}>
              <PostRow post={post} divider={index > 0} />
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
      </Section>
    </Screen>
  )
}
