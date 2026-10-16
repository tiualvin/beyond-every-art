import { createContext, useContext, type ReactNode } from 'react'

import type { ApiClient } from '../api/client'
import type { LibraryStore } from '../library/types'

/** What the screens read from and write to, provided once at the root. */
export type Services = {
  api: ApiClient
  library: LibraryStore
  /** The app is showing its bundled sample content. */
  usingFixtures: boolean
  /** The library survives a restart. False when the database would not open. */
  libraryPersistent: boolean
  siteUrl: string
}

const ServicesContext = createContext<Services | null>(null)

export function ServicesProvider({
  services,
  children,
}: {
  services: Services
  children: ReactNode
}) {
  return (
    <ServicesContext.Provider value={services}>
      {children}
    </ServicesContext.Provider>
  )
}

export function useServices(): Services {
  const services = useContext(ServicesContext)
  if (!services) throw new Error('ServicesProvider is missing.')
  return services
}
