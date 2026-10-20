// An image from the API, with its credit, and an honest state when it fails.
//
// URLs arrive absolute and are used as they are. The credit links only when the
// server sent a `creditHref`: the website's attribution module is the one thing
// allowed to build that link (it vets https and adds Unsplash's referral
// parameters), and the app renders its answer rather than building its own.
//
// Three states, kept apart. Loading sits on the quiet `line` colour. A failed
// image either leaves the layout (`fallback="hide"`, for a thumbnail beside a
// row's text) or shows the website's plate wash (`fallback="plate"`, for an
// image that holds its own place on the page). The wash is never the loading
// state: it used to be, and every screen flashed maroon while pictures came in.

import { Image } from 'expo-image'
import { useState } from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'

import type { Media } from '../api/contract'
import { Txt } from '../theme/text'
import { useTheme } from '../theme/theme'
import { space } from '../theme/typography'
import { useOpenExternal } from './link-context'
import { PlateWash } from './plate'

type Size = 'full' | 'card'

/** The source to load: the 768px derivative for a card, when it exists. */
export function imageSource(media: Media, size: Size): string {
  return size === 'card' ? (media.cardUrl ?? media.url) : media.url
}

/** The ratio the server knows, if it knows one. */
export function knownAspectRatio(media: Media): number | null {
  return media.width && media.height ? media.width / media.height : null
}

/** What to show before the real ratio is known: a landscape frame. */
export const FALLBACK_RATIO = 3 / 2

export function aspectRatioOf(media: Media): number {
  return knownAspectRatio(media) ?? FALLBACK_RATIO
}

type ImageProps = {
  media: Media
  size?: Size
  caption?: string | null
  showCredit?: boolean
  /** A failed image: the plate wash in its place, or nothing at all. */
  fallback?: 'plate' | 'hide'
  /** No space around the figure, for a thumbnail or a lead image. */
  bare?: boolean
  /** A fixed frame, cropped to fill — for thumbnails that line up in a list. */
  ratio?: number
  style?: StyleProp<ViewStyle>
}

/**
 * What a picture learned while loading — that it failed, or its shape —
 * belongs to that picture. A new source starts again, so a list row reused
 * for another article does not inherit the last one's failure.
 */
export function ReaderImage(props: ImageProps) {
  return (
    <ImageFigure
      key={imageSource(props.media, props.size ?? 'full')}
      {...props}
    />
  )
}

function ImageFigure({
  media,
  size = 'full',
  caption = null,
  showCredit = true,
  fallback = 'plate',
  bare = false,
  ratio,
  style,
}: ImageProps) {
  const { palette } = useTheme()
  const [failed, setFailed] = useState(false)
  const [measured, setMeasured] = useState<number | null>(null)
  const openExternal = useOpenExternal()
  const described = media.alt.trim().length > 0

  if (failed && fallback === 'hide') return null

  // A body image is shown whole: its own ratio when the server knows it, or
  // the picture's once it has loaded, never a crop of a portrait painting.
  const frameRatio =
    ratio ?? knownAspectRatio(media) ?? measured ?? FALLBACK_RATIO
  // No credit under the wash: it would credit a picture nobody can see.
  const credit = showCredit && !failed ? media.credit : null

  return (
    <View style={[bare ? undefined : styles.figure, style]}>
      <View
        style={[
          styles.frame,
          { aspectRatio: frameRatio, backgroundColor: palette.line },
        ]}
        accessible={described}
        accessibilityRole={described ? 'image' : undefined}
        accessibilityLabel={described ? media.alt : undefined}
        importantForAccessibility={described ? 'yes' : 'no-hide-descendants'}
      >
        {failed ? (
          <PlateWash />
        ) : (
          <Image
            source={{ uri: imageSource(media, size) }}
            style={StyleSheet.absoluteFill}
            contentFit={ratio ? 'cover' : 'contain'}
            cachePolicy="disk"
            transition={0}
            accessible={false}
            testID="reader-image"
            onLoad={(event) => {
              const { width, height } = event.source
              if (!knownAspectRatio(media) && width > 0 && height > 0) {
                setMeasured(width / height)
              }
            }}
            onError={() => setFailed(true)}
          />
        )}
      </View>
      {caption || credit ? (
        <View style={styles.caption}>
          {caption ? (
            <Txt variant="meta" tone="muted">
              {caption}
            </Txt>
          ) : null}
          {credit ? (
            media.creditHref ? (
              <Txt
                variant="meta"
                tone="muted"
                accessibilityRole="link"
                accessibilityHint="Opens in your browser"
                style={styles.creditLink}
                onPress={() => openExternal(media.creditHref!)}
              >
                {credit}
              </Txt>
            ) : (
              <Txt variant="meta" tone="muted">
                {credit}
              </Txt>
            )
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  figure: { marginVertical: space.lg },
  frame: { width: '100%', overflow: 'hidden', borderRadius: 2 },
  caption: { marginTop: space.sm, gap: 2 },
  creditLink: { textDecorationLine: 'underline' },
})
