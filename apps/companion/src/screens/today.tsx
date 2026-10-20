import { StyleSheet, View } from 'react-native'

import type { PostSummary } from '../api/contract'
import { LeadCard, PostRow } from '../components/post-row'
import { Screen } from '../components/screen'
import { Section } from '../components/section'
import {
  EmptyState,
  ErrorState,
  Loading,
  PreviewBadge,
} from '../components/states'
import { usePostsFeed } from '../data/hooks'
import { useServices } from '../data/services'
import { BRAND_COLORS } from '../generated/brand-tokens'
import { readableOn } from '../theme/colour'
import { Txt } from '../theme/text'
import { space } from '../theme/typography'
import { colourOfTheDay } from './colours'

/** The newest featured article on the first page, or the newest of all. */
export function pickLead(posts: PostSummary[]): PostSummary | null {
  return posts.find((post) => post.featured) ?? posts[0] ?? null
}

/**
 * Today's colour, given the whole field: one of the pigment colours the
 * website already uses, named, and nothing claimed about it beyond its name.
 * The text is ink or paper, whichever reads on the colour.
 */
export function ColourOfTheDay({ date }: { date: Date }) {
  const colour = colourOfTheDay(date)
  const ink = readableOn(colour.hex, BRAND_COLORS.onDark, BRAND_COLORS.ink)
  return (
    <View
      style={[styles.field, { backgroundColor: colour.hex }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Colour of the day: ${colour.name}`}
    >
      <Txt variant="kicker" style={{ color: ink }}>
        Colour of the day
      </Txt>
      <View style={styles.fieldName}>
        <Txt variant="title" style={{ color: ink }}>
          {colour.name}
        </Txt>
        <Txt variant="meta" style={{ color: ink }}>
          {colour.hex.toUpperCase()}
        </Txt>
      </View>
    </View>
  )
}

export function TodayScreen({ now = () => new Date() }: { now?: () => Date }) {
  const { usingFixtures } = useServices()
  const feed = usePostsFeed()
  const posts = feed.data?.pages[0]?.posts ?? []
  const lead = pickLead(posts)
  const latest = posts.filter((post) => post !== lead).slice(0, 3)

  return (
    <Screen
      spacing="sections"
      refreshing={feed.isRefetching}
      onRefresh={() => feed.refetch()}
    >
      <View style={styles.top}>
        {usingFixtures ? <PreviewBadge /> : null}
        {feed.isPending ? (
          <Loading label="Loading today’s article" />
        ) : lead ? (
          <LeadCard post={lead} />
        ) : feed.isError ? (
          <ErrorState error={feed.error} onRetry={() => feed.refetch()} />
        ) : (
          <EmptyState
            title="Nothing published yet"
            body="New articles appear here as the journal publishes them."
          />
        )}
      </View>
      {latest.length > 0 ? (
        <Section label="Latest">
          {latest.map((post, index) => (
            <PostRow key={post.slug} post={post} divider={index > 0} />
          ))}
        </Section>
      ) : null}
      <ColourOfTheDay date={now()} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  top: { gap: space.md },
  field: {
    minHeight: 180,
    padding: space.lg - space.xs,
    justifyContent: 'space-between',
    borderRadius: 2,
  },
  fieldName: { gap: space.xs },
})
