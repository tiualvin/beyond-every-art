import { useEffect, useState } from 'react'
import { StyleSheet, TextInput } from 'react-native'

import { MAX_SEARCH_LENGTH } from '../api/contract'
import { PostRow } from '../components/post-row'
import { Screen } from '../components/screen'
import { EmptyState, ErrorState, Loading } from '../components/states'
import { useSearch } from '../data/hooks'
import { familyFor } from '../theme/fonts'
import { useTheme } from '../theme/theme'
import { CAPSULE, MIN_TOUCH, space } from '../theme/typography'

/** The value, once it has stopped changing for `ms`. */
export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return settled
}

export function SearchScreen({ debounceMs = 300 }: { debounceMs?: number }) {
  const { palette } = useTheme()
  const [query, setQuery] = useState('')
  const term = useDebounced(query, debounceMs)
  const search = useSearch(term)

  return (
    <Screen>
      <TextInput
        accessibilityLabel="Search articles"
        placeholder="Search titles and standfirsts"
        placeholderTextColor={palette.muted}
        value={query}
        onChangeText={setQuery}
        autoFocus
        autoCorrect={false}
        returnKeyType="search"
        maxLength={MAX_SEARCH_LENGTH}
        style={[
          styles.input,
          {
            color: palette.text,
            borderColor: palette.field,
            backgroundColor: palette.surface,
          },
        ]}
      />
      {!term.trim() ? (
        <EmptyState
          title="Search the journal"
          body="Titles and standfirsts are searched."
        />
      ) : search.isPending ? (
        <Loading label="Searching" />
      ) : search.isError ? (
        <ErrorState error={search.error} onRetry={() => search.refetch()} />
      ) : search.data.posts.length === 0 ? (
        <EmptyState title={`Nothing matches “${search.data.query}”`} />
      ) : (
        search.data.posts.map((post, index) => (
          <PostRow key={post.slug} post={post} divider={index > 0} />
        ))
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  input: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: space.md + space.xs,
    borderWidth: 1,
    borderRadius: CAPSULE,
    fontFamily: familyFor('sans'),
    fontSize: 17,
  },
})
