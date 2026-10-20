import { PostDetailSchema } from '../contract'
import { FIXTURE_ORIGIN, createFixtureTransport } from '../fixture-transport'

const SITE = 'https://www.beyondeveryart.com'
const transport = createFixtureTransport(SITE)
const at = (path: string) => `${FIXTURE_ORIGIN}/app-api/v1/${path}`

describe('the fixture API', () => {
  it('redirects an unslashed path, as the website would', async () => {
    expect((await transport(at('tags'))).status).toBe(308)
  })

  it('answers 404 for a path it does not serve', async () => {
    expect((await transport(at('pages/about/'))).status).toBe(404)
    expect((await transport(at('posts/a/b/'))).status).toBe(404)
    expect(
      (await transport('https://elsewhere.invalid/app-api/v1/tags/')).status,
    ).toBe(404)
  })

  it('refuses a page or limit that is not a positive integer', async () => {
    expect((await transport(at('posts/?page=0'))).status).toBe(400)
    expect((await transport(at('posts/?limit=-3'))).status).toBe(400)
  })

  it('counts posts per tag, largest first', async () => {
    const response = await transport(at('tags/'))
    const { tags } = (await response.json()) as {
      tags: { slug: string; postCount: number }[]
    }
    const counts = tags.map((tag) => tag.postCount)
    expect(counts).toEqual([...counts].sort((a, b) => b - a))
    expect(tags.every((tag) => tag.postCount > 0)).toBe(true)
  })

  it('hands out copies, never the fixtures themselves', async () => {
    const first = (await (
      await transport(at('posts/fixture-every-module/'))
    ).json()) as {
      post: { title: string }
    }
    first.post.title = 'changed'
    const second = (await (
      await transport(at('posts/fixture-every-module/'))
    ).json()) as {
      post: { title: string }
    }
    expect(second.post.title).not.toBe('changed')
  })
})

describe('the showcase set', () => {
  const showcase = createFixtureTransport(SITE, 'showcase')
  const json = async (path: string) =>
    (await (await showcase(at(path))).json()) as Record<string, unknown>

  it('serves only posts the contract accepts as they are', async () => {
    const { posts } = (await json('posts/?limit=24')) as {
      posts: { slug: string }[]
    }
    expect(posts.length).toBeGreaterThanOrEqual(8)
    for (const { slug } of posts) {
      const { post } = await json(`posts/${slug}/`)
      expect(PostDetailSchema.parse(post)).toEqual(post)
    }
  })

  it('leads with a featured article, and carries one members-only teaser', async () => {
    const { posts } = (await json('posts/')) as {
      posts: { featured: boolean; visibility: string }[]
    }
    expect(posts[0]?.featured).toBe(true)
    expect(posts.filter((post) => post.visibility === 'members')).toHaveLength(
      1,
    )
  })

  it('names its own author, rather than the module fixtures’ editor', async () => {
    const { authors } = (await json('authors/')) as {
      authors: { slug: string; postCount: number }[]
    }
    expect(authors).toEqual([
      expect.objectContaining({ slug: 'sample-author', postCount: 9 }),
    ])
    expect((await showcase(at('authors/fixture-editor/'))).status).toBe(404)
  })

  it('never signs a sample with the publication’s name', async () => {
    // Only Today carries the preview badge; an article opened from anywhere
    // else has to read as a sample on its own.
    const { posts } = (await json('posts/?limit=24')) as {
      posts: { slug: string }[]
    }
    for (const { slug } of posts) {
      const { post } = (await json(`posts/${slug}/`)) as {
        post: {
          authors: { name: string }[]
          image: { credit: string | null } | null
        }
      }
      const signed = [
        ...post.authors.map((author) => author.name),
        post.image?.credit ?? '',
      ].join(' ')
      expect(signed).not.toMatch(/beyond every art/i)
    }
  })

  it('says nothing that reads as a test case', async () => {
    const { posts } = (await json('posts/?limit=24')) as {
      posts: { title: string; excerpt: string }[]
    }
    for (const post of posts) {
      expect(`${post.title} ${post.excerpt}`).not.toMatch(/fixture|E2E/i)
    }
  })
})
