// The screens' data: TanStack Query over the API client and the library.

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { Image } from 'expo-image'

import { normaliseQuery } from '../api/client'
import type { PostDetail, PostSummary } from '../api/contract'
import type { PaletteInput } from '../library/types'
import { articleImageUrls } from './images'
import { readPost } from './read-post'
import { useServices } from './services'

export const keys = {
  posts: ['posts'] as const,
  post: (slug: string) => ['post', slug] as const,
  tags: ['tags'] as const,
  tag: (slug: string) => ['tag', slug] as const,
  authors: ['authors'] as const,
  author: (slug: string) => ['author', slug] as const,
  search: (term: string) => ['search', term] as const,
  library: ['library'] as const,
  bookmarks: ['library', 'bookmarks'] as const,
  bookmarked: (slug: string) => ['library', 'bookmarked', slug] as const,
  saved: ['library', 'saved'] as const,
  isSaved: (slug: string) => ['library', 'is-saved', slug] as const,
  palettes: ['library', 'palettes'] as const,
}

export function usePostsFeed() {
  const { api } = useServices()
  return useInfiniteQuery({
    queryKey: keys.posts,
    queryFn: ({ pageParam }) => api.listPosts({ page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page < last.totalPages ? last.page + 1 : undefined,
  })
}

export function usePost(slug: string) {
  const { api, library } = useServices()
  return useQuery({
    queryKey: keys.post(slug),
    queryFn: () => readPost(api, library, slug),
    // Try even when offline: the saved copy is behind the failed request.
    networkMode: 'offlineFirst',
  })
}

export function useTags() {
  const { api } = useServices()
  return useQuery({ queryKey: keys.tags, queryFn: () => api.listTags() })
}

export function useTag(slug: string) {
  const { api } = useServices()
  return useQuery({ queryKey: keys.tag(slug), queryFn: () => api.getTag(slug) })
}

export function useAuthors() {
  const { api } = useServices()
  return useQuery({ queryKey: keys.authors, queryFn: () => api.listAuthors() })
}

export function useAuthor(slug: string) {
  const { api } = useServices()
  return useQuery({
    queryKey: keys.author(slug),
    queryFn: () => api.getAuthor(slug),
  })
}

export function useSearch(query: string) {
  const { api } = useServices()
  const term = normaliseQuery(query)
  return useQuery({
    queryKey: keys.search(term),
    queryFn: () => api.search(term),
    enabled: term.length > 0,
  })
}

// --- Library -----------------------------------------------------------

export function useBookmarks() {
  const { library } = useServices()
  return useQuery({
    queryKey: keys.bookmarks,
    queryFn: () => library.listBookmarks(),
  })
}

export function useIsBookmarked(slug: string) {
  const { library } = useServices()
  return useQuery({
    queryKey: keys.bookmarked(slug),
    queryFn: () => library.isBookmarked(slug),
  })
}

export function useSavedArticles() {
  const { library } = useServices()
  return useQuery({ queryKey: keys.saved, queryFn: () => library.listSaved() })
}

export function useIsSaved(slug: string) {
  const { library } = useServices()
  return useQuery({
    queryKey: keys.isSaved(slug),
    queryFn: async () => (await library.getSaved(slug)) !== null,
  })
}

/** Every library mutation refreshes every library read: they are all local and cheap. */
function useLibraryMutation<T>(run: (input: T) => Promise<unknown>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: run,
    // Local writes do not wait for a network that is not involved.
    networkMode: 'always',
    onSuccess: () => client.invalidateQueries({ queryKey: keys.library }),
  })
}

export function useToggleBookmark() {
  const { library } = useServices()
  return useLibraryMutation(
    async ({ post, bookmarked }: { post: PostSummary; bookmarked: boolean }) =>
      bookmarked
        ? library.removeBookmark(post.slug)
        : library.addBookmark(post),
  )
}

/** Fetches images into the disk cache. Never fails the save that asked. */
async function keepImages(urls: string[]): Promise<void> {
  if (urls.length === 0) return
  try {
    await Image.prefetch(urls, 'disk')
  } catch {
    // Best effort, as above.
  }
}

export function useSaveForOffline() {
  const { library } = useServices()
  return useLibraryMutation(async (post: PostDetail) => {
    await library.saveArticle(post)
    // Best effort: the words are saved whether or not every image arrives,
    // and the system may still evict an image cache it needs the space for.
    await keepImages(articleImageUrls(post))
  })
}

export function useRemoveSaved() {
  const { library } = useServices()
  return useLibraryMutation((slug: string) => library.removeSaved(slug))
}

export function usePalettes() {
  const { library } = useServices()
  return useQuery({
    queryKey: keys.palettes,
    queryFn: () => library.listPalettes(),
  })
}

export function useSavePalette() {
  const { library } = useServices()
  return useLibraryMutation((input: PaletteInput) => library.savePalette(input))
}

export function useDeletePalette() {
  const { library } = useServices()
  return useLibraryMutation((id: string) => library.deletePalette(id))
}
