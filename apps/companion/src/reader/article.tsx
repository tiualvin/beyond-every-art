// One article, as the reader shows it.

import { StyleSheet, View } from 'react-native'

import type { Body, PostDetail, Visibility } from '../api/contract'
import { formatDate } from '../format'
import { Txt } from '../theme/text'
import { useTheme } from '../theme/theme'
import { space } from '../theme/typography'
import { HtmlBody } from './html-body'
import { ReaderImage } from './image'
import { LexicalNodes } from './lexical'

export function ArticleBody({ body, base }: { body: Body; base: string }) {
  switch (body.kind) {
    case 'lexical':
      return <LexicalNodes nodes={body.nodes} />
    case 'html':
      return <HtmlBody html={body.html} base={base} />
    case 'empty':
      return null
  }
}

/**
 * Where the rest of a gated piece would be, said the way the website says it.
 *
 * There is no sign-in and nothing to buy: memberships are not open, and the app
 * makes no promise the website does not. No button — the one the website shows
 * opens its newsletter form, which is the website's to offer.
 */
export function MembershipNotice({ visibility }: { visibility: Visibility }) {
  const { palette } = useTheme()
  const audience = visibility === 'paid' ? 'subscribers' : 'members'
  return (
    <View
      style={[
        styles.notice,
        { borderColor: palette.rule, backgroundColor: palette.surface },
      ]}
      accessibilityRole="summary"
    >
      <Txt variant="kicker" tone="accent">
        {visibility === 'paid' ? 'Subscribers only' : 'Members only'}
      </Txt>
      <Txt variant="h3" accessibilityRole="header">
        The rest of this piece is for {audience}
      </Txt>
      <Txt tone="muted">
        Memberships are not open yet. When they are, {audience} will be able to
        read the whole piece here.
      </Txt>
    </View>
  )
}

export function Byline({ post }: { post: PostDetail }) {
  const parts = [
    post.authors.length
      ? `By ${post.authors.map((author) => author.name).join(', ')}`
      : null,
    formatDate(post.publishedAt),
    `${post.readingTime} min read`,
  ].filter(Boolean)
  return (
    <Txt variant="meta" tone="muted">
      {parts.join(' · ')}
    </Txt>
  )
}

export function Article({ post }: { post: PostDetail }) {
  const kicker = post.tags[0]?.name
  return (
    <View style={styles.article}>
      <View style={styles.header}>
        {kicker ? (
          <Txt variant="kicker" tone="accent">
            {kicker}
          </Txt>
        ) : null}
        <Txt variant="display" accessibilityRole="header">
          {post.title}
        </Txt>
        {post.excerpt ? (
          <Txt variant="standfirst" tone="muted">
            {post.excerpt}
          </Txt>
        ) : null}
        <Byline post={post} />
      </View>
      {post.image ? <ReaderImage media={post.image} /> : null}
      <View style={styles.body}>
        <ArticleBody body={post.body} base={post.href} />
        {post.restricted ? (
          <MembershipNotice visibility={post.visibility} />
        ) : null}
        {post.body.kind === 'empty' && !post.restricted ? (
          <Txt tone="muted">This article has no text the app can show.</Txt>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  article: { gap: space.md },
  header: { gap: space.sm },
  body: { marginTop: space.sm },
  notice: {
    gap: space.sm,
    padding: space.md,
    borderWidth: 1,
    borderRadius: 2,
    marginTop: space.md,
  },
})
