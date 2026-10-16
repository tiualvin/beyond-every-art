// One set of behaviours, held by both implementations.
//
// The SQLite store runs its real statements against Node's own SQLite through
// the same four calls it makes on the device, so what is tested here is the
// SQL that ships, not a stand-in for it.

import { DatabaseSync } from 'node:sqlite'

import { createMemoryLibraryStore } from '../memory-store'
import {
  createSqliteLibraryStore,
  migrate,
  type SqlDatabase,
} from '../sqlite-store'
import type { LibraryStore } from '../types'
import { fixturePosts } from '../../fixtures/posts'
import { toSummary } from '../../api/fixture-transport'
import {
  PostDetailSchema,
  markUnsupported,
  type PostDetail,
} from '../../api/contract'

const SITE = 'https://www.beyondeveryart.com'
// As the client holds them: validated, with unknown nodes already marked.
const [first, second] = fixturePosts(SITE).map((post) =>
  PostDetailSchema.parse({ ...post, body: markUnsupported(post.body) }),
) as [PostDetail, PostDetail]

function nodeSqlite(db = new DatabaseSync(':memory:')): SqlDatabase {
  return {
    execAsync: async (source) => {
      db.exec(source)
    },
    runAsync: async (source, ...params) => db.prepare(source).run(...params),
    getAllAsync: async <T>(
      source: string,
      ...params: (string | number | null)[]
    ) => db.prepare(source).all(...params) as T[],
    getFirstAsync: async <T>(
      source: string,
      ...params: (string | number | null)[]
    ) => (db.prepare(source).get(...params) as T | undefined) ?? null,
  }
}

/** A clock that moves a second each time it is read, so order is decided. */
function ticking() {
  let at = Date.parse('2026-10-16T09:00:00.000Z')
  return () => new Date((at += 1000))
}

const implementations: [string, () => Promise<LibraryStore>][] = [
  ['memory', async () => createMemoryLibraryStore(ticking())],
  [
    'sqlite',
    async () => {
      const db = nodeSqlite()
      await migrate(db)
      return createSqliteLibraryStore(db, ticking())
    },
  ],
]

describe.each(implementations)('the %s library', (_, open) => {
  let store: LibraryStore
  beforeEach(async () => {
    store = await open()
  })

  describe('bookmarks', () => {
    it('lists the newest first and knows what is bookmarked', async () => {
      await store.addBookmark(toSummary(first))
      await store.addBookmark(toSummary(second))
      expect(
        (await store.listBookmarks()).map((item) => item.post.slug),
      ).toEqual([second.slug, first.slug])
      expect(await store.isBookmarked(first.slug)).toBe(true)
      expect(await store.isBookmarked('missing')).toBe(false)
    })

    it('keeps the original date when bookmarked again', async () => {
      await store.addBookmark(toSummary(first))
      const [before] = await store.listBookmarks()
      await store.addBookmark({ ...toSummary(first), title: 'Retitled' })
      const [after] = await store.listBookmarks()
      expect(after?.bookmarkedAt).toBe(before?.bookmarkedAt)
      expect(after?.post.title).toBe('Retitled')
    })

    it('removes one', async () => {
      await store.addBookmark(toSummary(first))
      await store.removeBookmark(first.slug)
      expect(await store.listBookmarks()).toEqual([])
    })
  })

  describe('saved articles', () => {
    it('reads a saved article back whole, with no network', async () => {
      await store.saveArticle(first)
      expect(await store.getSaved(first.slug)).toEqual(first)
    })

    it('lists summaries without bodies, newest first', async () => {
      await store.saveArticle(first)
      await store.saveArticle(second)
      const saved = await store.listSaved()
      expect(saved.map((item) => item.post.slug)).toEqual([
        second.slug,
        first.slug,
      ])
      expect(saved[0]?.post).not.toHaveProperty('body')
    })

    it('replaces the saved copy with a newer one, keeping its date', async () => {
      await store.saveArticle(first)
      const [before] = await store.listSaved()
      await store.saveArticle({ ...first, title: 'Updated' })
      expect((await store.getSaved(first.slug))?.title).toBe('Updated')
      const after = await store.listSaved()
      expect(after).toHaveLength(1)
      expect(after[0]?.savedAt).toBe(before?.savedAt)
    })

    it('removes one', async () => {
      await store.saveArticle(first)
      await store.removeSaved(first.slug)
      expect(await store.getSaved(first.slug)).toBeNull()
    })
  })

  describe('palettes', () => {
    it('creates one, normalising its colours', async () => {
      const palette = await store.savePalette({
        name: '  Studio  ',
        colours: ['#6D1F2C', '#f6f2eb'],
      })
      expect(palette).toMatchObject({
        name: 'Studio',
        colours: ['#6d1f2c', '#f6f2eb'],
      })
      expect(await store.listPalettes()).toEqual([palette])
    })

    it('updates one in place, keeping when it was made', async () => {
      const created = await store.savePalette({
        name: 'One',
        colours: ['#000000'],
      })
      const updated = await store.savePalette({
        id: created.id,
        name: 'Two',
        colours: ['#ffffff'],
      })
      expect(updated.id).toBe(created.id)
      expect(updated.createdAt).toBe(created.createdAt)
      expect(await store.listPalettes()).toEqual([updated])
    })

    it('refuses a colour that is not #rrggbb, and an empty palette', async () => {
      await expect(
        store.savePalette({ name: 'Bad', colours: ['red'] }),
      ).rejects.toThrow()
      await expect(
        store.savePalette({ name: 'Empty', colours: [] }),
      ).rejects.toThrow()
      await expect(
        store.savePalette({ name: ' ', colours: ['#000000'] }),
      ).rejects.toThrow()
      expect(await store.listPalettes()).toEqual([])
    })

    it('deletes one', async () => {
      const palette = await store.savePalette({
        name: 'Gone',
        colours: ['#123456'],
      })
      await store.deletePalette(palette.id)
      expect(await store.listPalettes()).toEqual([])
    })
  })
})

describe('the SQLite library on disk', () => {
  it('migrates once, and again is a no-op', async () => {
    const raw = new DatabaseSync(':memory:')
    const db = nodeSqlite(raw)
    await migrate(db)
    await migrate(db)
    expect(raw.prepare('PRAGMA user_version').get()).toEqual({
      user_version: 1,
    })
  })

  it('drops a saved copy that no longer matches the contract', async () => {
    const raw = new DatabaseSync(':memory:')
    const db = nodeSqlite(raw)
    await migrate(db)
    const store = createSqliteLibraryStore(db)
    await store.saveArticle(first)
    raw
      .prepare('UPDATE saved_articles SET post = ? WHERE slug = ?')
      .run('{"slug":"broken"}', first.slug)
    expect(await store.getSaved(first.slug)).toBeNull()
  })
})
