import { View } from 'react-native'

import type { PostSummary } from '../api/contract'
import { PostRow } from '../components/post-row'
import { Screen } from '../components/screen'
import { EmptyState, ErrorState, Loading } from '../components/states'
import { useAuthor, useTag } from '../data/hooks'
import { Txt } from '../theme/text'

function Archive({
  query,
  missing,
}: {
  query: {
    isPending: boolean
    isError: boolean
    error: unknown
    refetch: () => unknown
    data?: {
      name: string
      description: string | null
      posts: PostSummary[]
    } | null
  }
  missing: string
}) {
  if (query.isPending)
    return (
      <Screen>
        <Loading />
      </Screen>
    )
  if (query.isError) {
    return (
      <Screen>
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </Screen>
    )
  }
  if (!query.data)
    return (
      <Screen>
        <EmptyState title={missing} />
      </Screen>
    )
  return (
    <Screen>
      <View>
        <Txt variant="title" accessibilityRole="header">
          {query.data.name}
        </Txt>
        {query.data.description ? (
          <Txt tone="muted">{query.data.description}</Txt>
        ) : null}
      </View>
      {query.data.posts.length === 0 ? (
        <EmptyState title="Nothing filed here yet" />
      ) : (
        <View>
          {query.data.posts.map((post) => (
            <PostRow key={post.slug} post={post} />
          ))}
        </View>
      )}
    </Screen>
  )
}

export function TagScreen({ slug }: { slug: string }) {
  const query = useTag(slug)
  return (
    <Archive
      missing="No such topic"
      query={{
        ...query,
        data: query.data && {
          name: query.data.tag.name,
          description: query.data.tag.description,
          posts: query.data.posts,
        },
      }}
    />
  )
}

export function AuthorScreen({ slug }: { slug: string }) {
  const query = useAuthor(slug)
  return (
    <Archive
      missing="No such author"
      query={{
        ...query,
        data: query.data && {
          name: query.data.author.name,
          description: query.data.author.bio,
          posts: query.data.posts,
        },
      }}
    />
  )
}
