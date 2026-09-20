/**
 * A stand-in for `next/image`, for `scripts/measure-rail-ladder.ts` only.
 *
 * `next/image` is a client-boundary module: outside a Next build its default
 * export is a descriptor object rather than a component, and
 * `renderToStaticMarkup` fails on it with "Element type is invalid". The
 * measurement harness renders the real `ArticleRail`, so it meets that.
 *
 * What it renders has to match what Next renders closely enough that the box
 * measures the same, and for `fill` that is exactly this: an absolutely
 * positioned image filling its nearest positioned ancestor. The height being
 * measured comes from the figure's `aspect-ratio` in the stylesheet rather
 * than from the picture, so a source that does not resolve measures the same
 * as one that does.
 *
 * Wired in by `paths` in `scripts/tsconfig.render.json`, which is the only
 * place this file is reachable from. Nothing in the application sees it.
 */
export default function Image({
  src,
  alt,
  fill,
  sizes,
  style,
}: {
  src: string
  alt: string
  fill?: boolean
  sizes?: string
  style?: React.CSSProperties
}) {
  return (
    // The whole point of this file is to be the `<img>` that `next/image`
    // would have rendered, in a script that never ships to a browser.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      sizes={sizes}
      decoding="async"
      loading="lazy"
      style={
        fill
          ? {
              position: 'absolute',
              height: '100%',
              width: '100%',
              inset: 0,
              ...style,
            }
          : style
      }
    />
  )
}
