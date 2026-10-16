// An image from the API, with its credit, and an honest plate when it fails.
//
// URLs arrive absolute and are used as they are. The credit links only when the
// server sent a `creditHref`: the website's attribution module is the one thing
// allowed to build that link (it vets https and adds Unsplash's referral
// parameters), and the app renders its answer rather than building its own.

import { Image } from 'expo-image'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'

import type { Media } from '../api/contract'
import { Txt } from '../theme/text'
import { useTheme } from '../theme/theme'
import { space } from '../theme/typography'
import { useOpenExternal } from './link-context'

type Size = 'full' | 'card'

/** The source to load: the 768px derivative for a card, when it exists. */
export function imageSource(media: Media, size: Size): string {
  return size === 'card' ? (media.cardUrl ?? media.url) : media.url
}

export function aspectRatioOf(media: Media): number {
  return media.width && media.height ? media.width / media.height : 3 / 2
}

export function ReaderImage({
  media,
  size = 'full',
  caption = null,
  showCredit = true,
}: {
  media: Media
  size?: Size
  caption?: string | null
  showCredit?: boolean
}) {
  const { palette } = useTheme()
  const [failed, setFailed] = useState(false)
  const openExternal = useOpenExternal()
  const described = media.alt.trim().length > 0

  return (
    <View style={styles.figure}>
      <View
        style={[
          styles.frame,
          {
            aspectRatio: aspectRatioOf(media),
            backgroundColor: palette.plate[1],
          },
        ]}
        accessible={described}
        accessibilityRole={described ? 'image' : undefined}
        accessibilityLabel={described ? media.alt : undefined}
        importantForAccessibility={described ? 'yes' : 'no-hide-descendants'}
      >
        {failed ? null : (
          <Image
            source={{ uri: imageSource(media, size) }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="disk"
            transition={0}
            accessible={false}
            onError={() => setFailed(true)}
          />
        )}
      </View>
      {caption || (showCredit && media.credit) ? (
        <View style={styles.caption}>
          {caption ? (
            <Txt variant="meta" tone="muted">
              {caption}
            </Txt>
          ) : null}
          {showCredit && media.credit ? (
            media.creditHref ? (
              <Txt
                variant="meta"
                tone="muted"
                accessibilityRole="link"
                accessibilityHint="Opens in your browser"
                style={styles.creditLink}
                onPress={() => openExternal(media.creditHref!)}
              >
                {media.credit}
              </Txt>
            ) : (
              <Txt variant="meta" tone="muted">
                {media.credit}
              </Txt>
            )
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  figure: { marginVertical: space.sm },
  frame: { width: '100%', overflow: 'hidden', borderRadius: 2 },
  caption: { marginTop: space.xs, gap: 2 },
  creditLink: { textDecorationLine: 'underline' },
})
