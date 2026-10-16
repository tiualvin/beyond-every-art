import { useRouter } from 'expo-router'
import { Pressable, StyleSheet, View } from 'react-native'

import type { PostSummary } from '../api/contract'
import { formatDate } from '../format'
import { ReaderImage } from '../reader/image'
import { Txt } from '../theme/text'
import { useTheme } from '../theme/theme'
import { space } from '../theme/typography'

export const articleRoute = (slug: string) =>
  ({ pathname: '/article/[slug]', params: { slug } }) as const

export function gateLabel(
  post: Pick<PostSummary, 'visibility'>,
): string | null {
  if (post.visibility === 'members') return 'Members'
  if (post.visibility === 'paid') return 'Subscribers'
  return null
}

export function postMeta(post: PostSummary): string {
  return [
    formatDate(post.publishedAt),
    `${post.readingTime} min read`,
    gateLabel(post),
  ]
    .filter(Boolean)
    .join(' · ')
}

/** One article in a list. The whole row is the link. */
export function PostRow({ post }: { post: PostSummary }) {
  const router = useRouter()
  const { palette } = useTheme()
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${post.title}. ${postMeta(post)}`}
      onPress={() => router.push(articleRoute(post.slug))}
      style={({ pressed }) => [
        styles.row,
        { borderColor: palette.line },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.text}>
        {post.tags[0] ? (
          <Txt variant="kicker" tone="accent">
            {post.tags[0].name}
          </Txt>
        ) : null}
        <Txt variant="h4">{post.title}</Txt>
        {post.excerpt ? (
          <Txt variant="meta" tone="muted" numberOfLines={3}>
            {post.excerpt}
          </Txt>
        ) : null}
        <Txt variant="meta" tone="muted">
          {postMeta(post)}
        </Txt>
      </View>
      {post.image ? (
        <View style={styles.thumb}>
          <ReaderImage media={post.image} size="card" showCredit={false} />
        </View>
      ) : null}
    </Pressable>
  )
}

/** The article a screen leads with. */
export function LeadCard({ post }: { post: PostSummary }) {
  const router = useRouter()
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${post.title}. ${postMeta(post)}`}
      onPress={() => router.push(articleRoute(post.slug))}
      style={({ pressed }) => [styles.lead, pressed && styles.pressed]}
    >
      {post.image ? (
        <ReaderImage media={post.image} size="card" showCredit={false} />
      ) : null}
      {post.tags[0] ? (
        <Txt variant="kicker" tone="accent">
          {post.tags[0].name}
        </Txt>
      ) : null}
      <Txt variant="display">{post.title}</Txt>
      {post.excerpt ? (
        <Txt variant="standfirst" tone="muted">
          {post.excerpt}
        </Txt>
      ) : null}
      <Txt variant="meta" tone="muted">
        {postMeta(post)}
      </Txt>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: space.md,
    paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1, gap: space.xs },
  thumb: { width: 96 },
  lead: { gap: space.sm },
  pressed: { opacity: 0.7 },
})
