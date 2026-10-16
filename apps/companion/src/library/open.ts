import { openDatabaseAsync } from 'expo-sqlite'

import { createMemoryLibraryStore } from './memory-store'
import { createSqliteLibraryStore, migrate } from './sqlite-store'
import type { LibraryStore } from './types'

export const LIBRARY_DATABASE = 'library.db'

/**
 * The device's library. If the database cannot be opened the library runs in
 * memory for this session: the reader loses what they save until the app
 * quits, rather than losing the app.
 */
export async function openLibrary(): Promise<{
  store: LibraryStore
  persistent: boolean
}> {
  try {
    const db = await openDatabaseAsync(LIBRARY_DATABASE)
    await migrate(db)
    return { store: createSqliteLibraryStore(db), persistent: true }
  } catch (error) {
    if (__DEV__) console.warn('The library database did not open.', error)
    return { store: createMemoryLibraryStore(), persistent: false }
  }
}
