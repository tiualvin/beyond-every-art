import { StyleSheet, View } from 'react-native'

import type { PostSummary } from '../api/contract'
import { LeadCard, PostRow } from '../components/post-row'
import { Screen } from '../components/screen'
import { EmptyState, ErrorState, Loading, Notice } from '../components/states'
import { usePostsFeed } from '../data/hooks'
import { useServices } from '../data/services'
import { Txt } from '../theme/text'
import { useTheme } from '../theme/theme'
import { space } from '../theme/typography'
import { pigmentOfTheDay } from './colours'

/** The newest featured article on the first page, or the newest of all. */
export function pickLead(posts: PostSummary[]): PostSummary | null {
  return posts.find((post) => post.featured) ?? posts[0] ?? null
}

export function FixtureNotice() {
  const { usingFixtures } = useServices()
  return usingFixtures ? (
    <Notice>
      Sample content. This build is not connected to the website, so what you
      read here comes from fixtures bundled with the app.
    </Notice>
  ) : null
}

/**
 * Today's colour, from the pigment colours the website already uses. It says
 * nothing about the pigment itself: that waits for a Pigments collection,
 * and the card says so rather than making something up.
 */
export function PigmentCard({ date }: { date: Date }) {
  const { palette } = useTheme()
  const pigment = pigmentOfTheDay(date)
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: palette.surface, borderColor: palette.line },
      ]}
    >
      <View
        style={[
          styles.swatch,
          { backgroundColor: pigment.hex, borderColor: palette.rule },
        ]}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`A swatch of ${pigment.name}`}
      />
      <View style={styles.cardText}>
        <Txt variant="kicker" tone="accent">
          Colour of the day
        </Txt>
        <Txt variant="h3">{pigment.name}</Txt>
        <Txt variant="meta" tone="muted">
          {pigment.hex.toUpperCase()}
        </Txt>
        <Txt variant="meta" tone="muted">
          From the Beyond Every Art palette. Notes on the pigment itself will
          come with the Pigments collection, which is not built yet.
        </Txt>
      </View>
    </View>
  )
}

export function TodayScreen({ now = () => new Date() }: { now?: () => Date }) {
  const feed = usePostsFeed()
  const posts = feed.data?.pages[0]?.posts ?? []
  const lead = pickLead(posts)
  const latest = posts.filter((post) => post !== lead).slice(0, 3)

  return (
    <Screen refreshing={feed.isRefetching} onRefresh={() => feed.refetch()}>
      <FixtureNotice />
      {feed.isPending ? (
        <Loading label="Loading today’s article" />
      ) : lead ? (
        <LeadCard post={lead} />
      ) : feed.isError ? (
        <ErrorState error={feed.error} onRetry={() => feed.refetch()} />
      ) : (
        <EmptyState title="Nothing published yet" />
      )}
      <PigmentCard date={now()} />
      {latest.length > 0 ? (
        <View>
          <Txt variant="h3" accessibilityRole="header">
            Latest
          </Txt>
          {latest.map((post) => (
            <PostRow key={post.slug} post={post} />
          ))}
        </View>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: space.md,
    padding: space.md,
    borderWidth: 1,
    borderRadius: 2,
  },
  swatch: {
    width: 72,
    height: 96,
    borderRadius: 2,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardText: { flex: 1, gap: space.xs },
})
