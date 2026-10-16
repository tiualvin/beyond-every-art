// The query cache, and what of it outlives the app.
//
// Persisted to the device through expo-sqlite's key-value store — the same
// engine the library uses — so a reader who opened an article yesterday can
// open it again on a train today. Saving an article for offline reading is the
// promise; this is the courtesy, and it expires.

import { QueryClient, type Query } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client'

import { API_PREFIX } from '../api/contract'

/** How long a persisted response is kept before it is thrown away unread. */
export const PERSIST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * The website releases on a ten-minute cache. Asking more often than every
 * five minutes buys nothing but requests.
 */
export const STALE_TIME_MS = 5 * 60 * 1000

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_TIME_MS,
        // At least as long as persistence, or the persisted entries would be
        // garbage-collected before anyone could restore them.
        gcTime: PERSIST_MAX_AGE_MS,
        retry: 1,
      },
    },
  })
}

/**
 * What is worth writing to disk: successful content reads. Not the library,
 * which is already on disk, and not searches, which are cheap to repeat and
 * would otherwise keep every term a reader typed.
 */
export function shouldPersist(query: Query): boolean {
  const [scope] = query.queryKey
  return (
    query.state.status === 'success' &&
    scope !== 'library' &&
    scope !== 'search'
  )
}

type KeyValueStorage = {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
}

export function persistOptions(
  storage: KeyValueStorage,
): Omit<PersistQueryClientOptions, 'queryClient'> {
  return {
    persister: createAsyncStoragePersister({
      storage,
      key: 'companion-query-cache',
      throttleTime: 1000,
    }),
    maxAge: PERSIST_MAX_AGE_MS,
    // A new contract version means a persisted response may not parse; start
    // clean rather than restore something the screens cannot read.
    buster: API_PREFIX,
    dehydrateOptions: { shouldDehydrateQuery: shouldPersist },
  }
}
