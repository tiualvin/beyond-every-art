// The library in SQLite, on the device.
//
// expo-sqlite rather than MMKV: it ships inside the Expo SDK (its version moves
// with the SDK, and it runs in Expo Go as well as a development build), the
// library is a few small tables queried in order rather than a bag of keys, and
// the same database file serves the query cache through `expo-sqlite/kv-store`
// — one storage engine on the device instead of two. MMKV is faster for single
// keys, which is not where the time goes here.
//
// Written against the four calls it needs rather than the whole of
// `SQLiteDatabase`, which is what lets the tests run these exact statements
// against Node's own SQLite.

import type { PostDetail, PostSummary } from '../api/contract'
import type {
  Bookmark,
  LibraryStore,
  Palette,
  PaletteInput,
  SavedArticle,
} from './types'
import {
  newId,
  readStoredPost,
  readStoredSummary,
  summaryOf,
  validPaletteInput,
} from './validate'

type Param = string | number | null

/** The part of expo-sqlite's `SQLiteDatabase` this store uses. */
export interface SqlDatabase {
  execAsync(source: string): Promise<void>
  runAsync(source: string, ...params: Param[]): Promise<unknown>
  getAllAsync<T>(source: string, ...params: Param[]): Promise<T[]>
  getFirstAsync<T>(source: string, ...params: Param[]): Promise<T | null>
}

/** Bumped with each change below, applied in order on open. */
const MIGRATIONS = [
  `
  CREATE TABLE IF NOT EXISTS bookmarks (
    slug TEXT PRIMARY KEY NOT NULL,
    summary TEXT NOT NULL,
    bookmarked_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS saved_articles (
    slug TEXT PRIMARY KEY NOT NULL,
    summary TEXT NOT NULL,
    post TEXT NOT NULL,
    saved_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS palettes (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    colours TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  `,
]

export async function migrate(db: SqlDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version',
  )
  const current = row?.user_version ?? 0
  for (let version = current; version < MIGRATIONS.length; version += 1) {
    await db.execAsync(
      `BEGIN; ${MIGRATIONS[version]} PRAGMA user_version = ${version + 1}; COMMIT;`,
    )
  }
}

type PaletteRow = {
  id: string
  name: string
  colours: string
  created_at: string
  updated_at: string
}

function toPalette(row: PaletteRow): Palette | null {
  try {
    const colours = JSON.parse(row.colours) as unknown
    if (!Array.isArray(colours)) return null
    return {
      id: row.id,
      name: row.name,
      colours: colours.filter(
        (colour): colour is string => typeof colour === 'string',
      ),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  } catch {
    return null
  }
}

const present = <T>(value: T | null): value is T => value !== null

/** A store over an open, migrated database. */
export function createSqliteLibraryStore(
  db: SqlDatabase,
  now: () => Date = () => new Date(),
): LibraryStore {
  return {
    async listBookmarks() {
      const rows = await db.getAllAsync<{
        summary: string
        bookmarked_at: string
      }>(
        'SELECT summary, bookmarked_at FROM bookmarks ORDER BY bookmarked_at DESC, slug',
      )
      return rows
        .map((row): Bookmark | null => {
          const post = readStoredSummary(row.summary)
          return post ? { post, bookmarkedAt: row.bookmarked_at } : null
        })
        .filter(present)
    },
    async isBookmarked(slug) {
      return Boolean(
        await db.getFirstAsync('SELECT 1 FROM bookmarks WHERE slug = ?', slug),
      )
    },
    async addBookmark(post: PostSummary) {
      // Re-bookmarking keeps the original date and refreshes the listing.
      await db.runAsync(
        `INSERT INTO bookmarks (slug, summary, bookmarked_at) VALUES (?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET summary = excluded.summary`,
        post.slug,
        JSON.stringify(summaryOf(post)),
        now().toISOString(),
      )
    },
    async removeBookmark(slug) {
      await db.runAsync('DELETE FROM bookmarks WHERE slug = ?', slug)
    },

    async listSaved() {
      const rows = await db.getAllAsync<{ summary: string; saved_at: string }>(
        'SELECT summary, saved_at FROM saved_articles ORDER BY saved_at DESC, slug',
      )
      return rows
        .map((row): SavedArticle | null => {
          const post = readStoredSummary(row.summary)
          return post ? { post, savedAt: row.saved_at } : null
        })
        .filter(present)
    },
    async getSaved(slug) {
      const row = await db.getFirstAsync<{ post: string }>(
        'SELECT post FROM saved_articles WHERE slug = ?',
        slug,
      )
      return row ? readStoredPost(row.post) : null
    },
    async saveArticle(post: PostDetail) {
      await db.runAsync(
        `INSERT INTO saved_articles (slug, summary, post, saved_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET
           summary = excluded.summary, post = excluded.post, saved_at = excluded.saved_at`,
        post.slug,
        JSON.stringify(summaryOf(post)),
        JSON.stringify(post),
        now().toISOString(),
      )
    },
    async removeSaved(slug) {
      await db.runAsync('DELETE FROM saved_articles WHERE slug = ?', slug)
    },

    async listPalettes() {
      const rows = await db.getAllAsync<PaletteRow>(
        'SELECT * FROM palettes ORDER BY updated_at DESC, id',
      )
      return rows.map(toPalette).filter(present)
    },
    async savePalette(input: PaletteInput) {
      const valid = validPaletteInput(input)
      const at = now().toISOString()
      const existing = valid.id
        ? await db.getFirstAsync<PaletteRow>(
            'SELECT * FROM palettes WHERE id = ?',
            valid.id,
          )
        : null
      const palette: Palette = {
        id: existing?.id ?? valid.id ?? newId(),
        name: valid.name,
        colours: valid.colours,
        createdAt: existing?.created_at ?? at,
        updatedAt: at,
      }
      await db.runAsync(
        `INSERT INTO palettes (id, name, colours, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, colours = excluded.colours, updated_at = excluded.updated_at`,
        palette.id,
        palette.name,
        JSON.stringify(palette.colours),
        palette.createdAt,
        palette.updatedAt,
      )
      return palette
    },
    async deletePalette(id) {
      await db.runAsync('DELETE FROM palettes WHERE id = ?', id)
    },
  }
}
