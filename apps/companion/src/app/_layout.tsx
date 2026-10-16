import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { useFonts } from 'expo-font'
import { router, Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import Storage from 'expo-sqlite/kv-store'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useMemo, useState } from 'react'
import { Linking } from 'react-native'

import { api, usingFixtures } from '../api'
import { articleRoute } from '../components/post-row'
import { appConfig } from '../config'
import { connectOnlineManager } from '../data/online'
import { createQueryClient, persistOptions } from '../data/query-client'
import { ServicesProvider, type Services } from '../data/services'
import { openLibrary } from '../library/open'
import { NavigationTheme } from '../navigation-theme'
import { LinkProvider, type LinkActions } from '../reader/link-context'
import { FONT_ASSETS } from '../theme/fonts'
import { ThemeProvider } from '../theme/theme'

void SplashScreen.preventAutoHideAsync()
connectOnlineManager()

const links: LinkActions = {
  siteUrl: appConfig.siteUrl,
  openArticle: (slug) => router.push(articleRoute(slug)),
  openExternal: (href) => {
    Linking.openURL(href).catch(() => undefined)
  },
}

export default function RootLayout() {
  // A font that fails to load leaves the system face, not a blank app.
  const [fontsLoaded, fontError] = useFonts(FONT_ASSETS)
  const [library, setLibrary] = useState<Awaited<
    ReturnType<typeof openLibrary>
  > | null>(null)
  const [queryClient] = useState(createQueryClient)
  const persistence = useMemo(() => persistOptions(Storage), [])

  useEffect(() => {
    void openLibrary().then(setLibrary)
  }, [])

  const ready = Boolean((fontsLoaded || fontError) && library)
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync()
  }, [ready])

  const services = useMemo<Services | null>(
    () =>
      library && {
        api,
        library: library.store,
        usingFixtures,
        libraryPersistent: library.persistent,
        siteUrl: appConfig.siteUrl,
      },
    [library],
  )

  if (!ready || !services) return null

  return (
    <ThemeProvider>
      <NavigationTheme>
        <ServicesProvider services={services}>
          <PersistQueryClientProvider
            client={queryClient}
            persistOptions={persistence}
          >
            <LinkProvider actions={links}>
              <StatusBar style="auto" />
              <Stack>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="index" options={{ headerShown: false }} />
                <Stack.Screen
                  name="article/[slug]"
                  options={{
                    title: '',
                    headerBackButtonDisplayMode: 'minimal',
                  }}
                />
                <Stack.Screen name="tag/[slug]" options={{ title: '' }} />
                <Stack.Screen name="author/[slug]" options={{ title: '' }} />
              </Stack>
            </LinkProvider>
          </PersistQueryClientProvider>
        </ServicesProvider>
      </NavigationTheme>
    </ThemeProvider>
  )
}
