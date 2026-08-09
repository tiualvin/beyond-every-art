import Image from 'next/image'
import Link from 'next/link'

import type { TopicCard as TopicCardData } from '@/lib/content/queries'

const THUMB_SIZES = '(max-width: 40rem) 50vw, 20rem'

export function TopicCard({ topic }: { topic: TopicCardData }) {
  return (
    <Link href={`/tag/${topic.slug}`} className="topic-card">
      {topic.image && (
        <Image
          src={topic.image.url}
          alt={topic.image.alt}
          fill
          sizes={THUMB_SIZES}
          className="topic-card__image"
        />
      )}
      <div className="topic-card__overlay" />
      <div className="topic-card__content">
        <span className="topic-card__name">{topic.name}</span>
        <span className="topic-card__count">
          {topic.postCount} {topic.postCount === 1 ? 'story' : 'stories'}
        </span>
      </div>
    </Link>
  )
}
