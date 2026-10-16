// What the reader keeps on the device, behind one interface.
//
// Bookmarks, articles saved for offline reading, and palettes are all local:
// there are no reader accounts, and a server-side bookmark needs a collection
// that the owner's decision keeps gated (docs/COMPANION_APP.md). Every screen
// reaches them through `LibraryStore`, so the day a server-backed version is
// scheduled it replaces the implementation and none of the screens.

import type { PostDetail, PostSummary } from '../api/contract'

export type Bookmark = {
  /** The listing as it was when the reader bookmarked it, for offline lists. */
  post: PostSummary
  bookmarkedAt: string
}

/** A saved article, without its body: what a list of saved articles shows. */
export type SavedArticle = {
  post: PostSummary
  savedAt: string
}

export type Palette = {
  id: string
  name: string
  /** Lower-case `#rrggbb`, in the order the reader arranged them. */
  colours: string[]
  createdAt: string
  updatedAt: string
}

export type PaletteInput = { id?: string; name: string; colours: string[] }

export interface LibraryStore {
  /** Newest first. */
  listBookmarks(): Promise<Bookmark[]>
  isBookmarked(slug: string): Promise<boolean>
  addBookmark(post: PostSummary): Promise<void>
  removeBookmark(slug: string): Promise<void>

  /** Newest first. */
  listSaved(): Promise<SavedArticle[]>
  /** The full article, readable with no network; null if not saved. */
  getSaved(slug: string): Promise<PostDetail | null>
  /**
   * Saves, or replaces the saved copy with a newer one. Replacing keeps the
   * date it was first saved, so refreshing a copy does not reorder the list.
   */
  saveArticle(post: PostDetail): Promise<void>
  removeSaved(slug: string): Promise<void>

  /** Most recently changed first. */
  listPalettes(): Promise<Palette[]>
  /** Creates a palette, or updates the one with this id. Throws on invalid input. */
  savePalette(input: PaletteInput): Promise<Palette>
  deletePalette(id: string): Promise<void>
}
