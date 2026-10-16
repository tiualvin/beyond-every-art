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
