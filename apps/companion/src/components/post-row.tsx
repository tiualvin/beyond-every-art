import { useRouter } from 'expo-router'
import { Pressable, StyleSheet, View } from 'react-native'

import type { PostSummary } from '../api/contract'
import { formatDate } from '../format'
import { aspectRatioOf, ReaderImage } from '../reader/image'
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

/**
 * One article in a list. The whole row is the link. Rows are divided from
 * each other, not from the section rule above the first: pass
 * `divider={false}` for the first row.
 *
 * The headline leads. The topic sits quietly in the footer beside the date,
 * not in burgundy above every headline: a coloured kicker on each row made a
 * list a column of red labels, and only the lead keeps one.
 */
export function PostRow({
  post,
  divider = true,
}: {
  post: PostSummary
  divider?: boolean
}) {
  const router = useRouter()
  const { palette } = useTheme()
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${post.title}. ${postMeta(post)}`}
      onPress={() => router.push(articleRoute(post.slug))}
      style={({ pressed }) => [
        styles.row,
        divider && [styles.divided, { borderColor: palette.line }],
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.text}>
        <Txt variant="rowTitle">{post.title}</Txt>
        {post.excerpt ? (
          <Txt variant="summary" tone="muted" numberOfLines={3}>
            {post.excerpt}
          </Txt>
        ) : null}
        <View style={styles.footer}>
          {post.tags[0] ? (
            <Txt variant="section" tone="muted">
              {post.tags[0].name}
            </Txt>
          ) : null}
          <Txt variant="meta" tone="muted">
            {postMeta(post)}
          </Txt>
        </View>
      </View>
      {post.image ? (
        <ReaderImage
          media={post.image}
          size="card"
          showCredit={false}
          fallback="hide"
          bare
          ratio={1}
          style={styles.thumb}
        />
      ) : null}
    </Pressable>
  )
}

/**
 * A lead image's frame: its own shape, within reason. A tall portrait would
 * push the headline off the screen and a panorama would shrink to a strip, so
 * the frame stays between 4:5 and 16:9 and the picture fills it.
 */
export function leadRatio(ratio: number): number {
  return Math.min(16 / 9, Math.max(4 / 5, ratio))
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
        <ReaderImage
          media={post.image}
          showCredit={false}
          bare
          ratio={leadRatio(aspectRatioOf(post.image))}
        />
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
    paddingVertical: space.md + 2,
  },
  divided: { borderTopWidth: StyleSheet.hairlineWidth },
  text: { flex: 1, gap: space.xs },
  // Wraps under a large text size rather than squeezing the date.
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: space.sm + space.xs,
    marginTop: space.xs,
  },
  thumb: { width: 80 },
  lead: { gap: space.sm },
  pressed: { opacity: 0.7 },
})
