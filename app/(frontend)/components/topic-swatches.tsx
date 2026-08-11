import Link from 'next/link'

import type { TopicCard } from '@/lib/content/queries'
import { pigmentFor, textOn } from '@/lib/design/pigments'
import { tagPath } from '@/lib/seo/site'

/** Floor, so the smallest subject still reads as a field of paint. */
const MIN_FILL = 30
const FILL_RANGE = 54

/**
 * Subjects as pigment swatches, filled in proportion to how much of the archive
 * each one covers — a paint box you can also read as a bar chart.
 */
export function TopicSwatches({ topics }: { topics: TopicCard[] }) {
  const max = Math.max(...topics.map((topic) => topic.postCount), 1)

  return (
    <div className="swatches">
      {topics.map((topic) => {
        const pigment = pigmentFor(topic.slug)
        const fill = MIN_FILL + (topic.postCount / max) * FILL_RANGE

        return (
          <Link
            key={topic.slug}
            href={tagPath(topic.slug)}
            className="swatch"
            style={
              {
                '--pigment': pigment.hex,
                '--pigment-ink': textOn(pigment.hex),
              } as React.CSSProperties
            }
          >
            <span className="swatch__fill" style={{ height: `${fill}%` }} />
            <span className="swatch__body">
              <span className="swatch__name">{topic.name}</span>
              <span className="swatch__count">
                {topic.postCount} {topic.postCount === 1 ? 'piece' : 'pieces'}
              </span>
            </span>
          </Link>
        )
      })}
    </div>
  )
}
