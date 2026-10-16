// The website's reader types, as the content contract shapes them.
//
// Every response is built here and then parsed through its contract schema
// before it is sent (`respondWith` in each route). Parsing drops any key the
// schema does not name, so this is a second allow-list at the boundary, behind
// the one in `project.ts`: a field added to a reader type later cannot reach a
// client by being passed along.

import type {
  AuthorCard,
  PostCard,
  PostDetail as SitePostDetail,
  TopicCard,
} from '../content/queries'
import { getSiteUrl, absoluteUrl, postPath } from '../seo/site'
import type { Author, PostDetail, PostSummary, Topic } from './contract'
import { mediaFromImage, projectBody } from './project'

const siteUrl = (): string => getSiteUrl()

export function toPostSummary(card: PostCard): PostSummary {
  const site = siteUrl()
  return {
    slug: card.slug,
    title: card.title,
    excerpt: card.excerpt,
    href: absoluteUrl(postPath(card.slug), site),
    publishedAt: card.publishedAt,
    featured: card.featured,
    readingTime: card.readingTime,
    visibility: card.visibility,
    authors: card.authors.map((author) => ({
      name: author.name,
      slug: author.slug ?? null,
    })),
    tags: card.tags.map((tag) => ({ name: tag.name, slug: tag.slug })),
    image: card.image ? mediaFromImage(card.image, site) : null,
  }
}

export function toPostDetail(
  post: SitePostDetail,
  now: Date = new Date(),
): PostDetail {
  const site = siteUrl()
  return {
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    href: absoluteUrl(postPath(post.slug), site),
    publishedAt: post.publishedAt,
    updatedAt: post.updatedAt,
    featured: post.featured,
    readingTime: post.readingTime,
    visibility: post.visibility,
    restricted: post.restricted,
    authors: post.authors.map((author): Author => ({
      name: author.name,
      slug: author.slug ?? null,
      bio: author.bio?.trim() || null,
      image: author.image ? mediaFromImage(author.image, site) : null,
    })),
    tags: post.tags.map((tag) => ({ name: tag.name, slug: tag.slug })),
    image: post.image ? mediaFromImage(post.image, site) : null,
    body: projectBody(post.body, { siteUrl: site, now }),
  }
}

export function toTopic(topic: TopicCard): Topic {
  return { name: topic.name, slug: topic.slug, postCount: topic.postCount }
}

export function toAuthorEntry(
  author: AuthorCard,
): Author & { postCount: number } {
  return {
    name: author.name,
    slug: author.slug,
    bio: author.bio,
    image: author.image ? mediaFromImage(author.image, siteUrl()) : null,
    postCount: author.postCount,
  }
}
