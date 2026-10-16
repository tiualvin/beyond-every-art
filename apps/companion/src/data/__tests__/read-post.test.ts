import { ApiError, createApiClient, type ApiClient } from '../../api/client'
import {
  PostDetailSchema,
  markUnsupported,
  type PostDetail,
} from '../../api/contract'
import {
  FIXTURE_ORIGIN,
  createFixtureTransport,
} from '../../api/fixture-transport'
import { fixturePosts } from '../../fixtures/posts'
import { createMemoryLibraryStore } from '../../library/memory-store'
import { TEST_SITE } from '../../test/render'
import { readPost } from '../read-post'

const fixtures = () =>
  createApiClient({
    baseUrl: FIXTURE_ORIGIN,
    transport: createFixtureTransport(TEST_SITE),
  })

const post = PostDetailSchema.parse(
  (({ body, ...rest }) => ({ ...rest, body: markUnsupported(body) }))(
    fixturePosts(TEST_SITE).find(
      (candidate) => candidate.slug === 'fixture-migrated-article',
    )!,
  ),
) as PostDetail

const failing = (api: ApiClient): ApiClient => ({
  ...api,
  getPost: () => Promise.reject(new ApiError('network', 'x', 'offline')),
})

describe('reading a post', () => {
  it('reads from the network when it can', async () => {
    const read = await readPost(
      fixtures(),
      createMemoryLibraryStore(),
      post.slug,
    )
    expect(read).toMatchObject({ source: 'network', post: { slug: post.slug } })
  })

  it('refreshes a saved copy with what the website now says', async () => {
    const library = createMemoryLibraryStore()
    await library.saveArticle({ ...post, title: 'An older title' })
    await readPost(fixtures(), library, post.slug)
    expect((await library.getSaved(post.slug))?.title).toBe(post.title)
  })

  it('falls back to the saved copy when the network fails', async () => {
    const library = createMemoryLibraryStore()
    await library.saveArticle(post)
    expect(await readPost(failing(fixtures()), library, post.slug)).toEqual({
      post,
      source: 'saved',
      goneFromWebsite: false,
    })
  })

  it('fails when the network fails and nothing is saved', async () => {
    await expect(
      readPost(failing(fixtures()), createMemoryLibraryStore(), post.slug),
    ).rejects.toMatchObject({ kind: 'network' })
  })

  it('keeps a saved copy readable after the website drops the article', async () => {
    const library = createMemoryLibraryStore()
    const gone = { ...post, slug: 'since-unpublished' }
    await library.saveArticle(gone)
    expect(await readPost(fixtures(), library, gone.slug)).toMatchObject({
      source: 'saved',
      goneFromWebsite: true,
    })
  })

  it('answers nothing for a slug nobody has', async () => {
    expect(
      await readPost(fixtures(), createMemoryLibraryStore(), 'about'),
    ).toEqual({
      post: null,
      source: 'network',
    })
  })
})
