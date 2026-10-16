// The library in memory: for tests, and for a device whose database will not
// open, where losing the library at quit beats losing the app.

import type { PostDetail, PostSummary } from '../api/contract'
import type { Bookmark, LibraryStore, Palette, PaletteInput } from './types'
import { newId, summaryOf, validPaletteInput } from './validate'

const byNewest =
  <T>(date: (item: T) => string) =>
  (a: T, b: T) =>
    date(b).localeCompare(date(a))

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

export function createMemoryLibraryStore(
  now: () => Date = () => new Date(),
): LibraryStore {
  const bookmarks = new Map<string, Bookmark>()
  const saved = new Map<string, { post: PostDetail; savedAt: string }>()
  const palettes = new Map<string, Palette>()

  return {
    async listBookmarks() {
      return [...bookmarks.values()]
        .sort(byNewest((item) => item.bookmarkedAt))
        .map(clone)
    },
    async isBookmarked(slug) {
      return bookmarks.has(slug)
    },
    async addBookmark(post: PostSummary) {
      bookmarks.set(post.slug, {
        post: summaryOf(post),
        bookmarkedAt:
          bookmarks.get(post.slug)?.bookmarkedAt ?? now().toISOString(),
      })
    },
    async removeBookmark(slug) {
      bookmarks.delete(slug)
    },

    async listSaved() {
      return [...saved.values()]
        .sort(byNewest((item) => item.savedAt))
        .map(({ post, savedAt }) => ({ post: summaryOf(post), savedAt }))
    },
    async getSaved(slug) {
      const entry = saved.get(slug)
      return entry ? clone(entry.post) : null
    },
    async saveArticle(post) {
      saved.set(post.slug, { post: clone(post), savedAt: now().toISOString() })
    },
    async removeSaved(slug) {
      saved.delete(slug)
    },

    async listPalettes() {
      return [...palettes.values()]
        .sort(byNewest((palette) => palette.updatedAt))
        .map(clone)
    },
    async savePalette(input: PaletteInput) {
      const valid = validPaletteInput(input)
      const at = now().toISOString()
      const existing = valid.id ? palettes.get(valid.id) : undefined
      const palette: Palette = {
        id: existing?.id ?? valid.id ?? newId(),
        name: valid.name,
        colours: valid.colours,
        createdAt: existing?.createdAt ?? at,
        updatedAt: at,
      }
      palettes.set(palette.id, palette)
      return clone(palette)
    },
    async deletePalette(id) {
      palettes.delete(id)
    },
  }
}
