import type { ExpoConfig } from 'expo/config'

/**
 * Where the app reads content from.
 *
 * Unset is the default and the safe state: the app serves its bundled fixtures
 * and makes no network request for content at all. Set it to a website running
 * with `APP_API_ENABLED=1` — a local one, never production until the owner says
 * so (docs/COMPANION_APP.md).
 */
const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || null

/**
 * The website's public origin, used to recognise links to an article so they
 * open in the app, and as the base for relative links in migrated bodies.
 */
const siteUrl =
  process.env.EXPO_PUBLIC_SITE_URL?.trim() || 'https://www.beyondeveryart.com'

/**
 * Which sample articles the app shows with no API: `showcase`, the default,
 * written to look like the journal's; or `modules`, the test cases that carry
 * every block and edge case the reader handles.
 */
const fixtureSet = process.env.EXPO_PUBLIC_FIXTURE_SET?.trim() || 'showcase'

const config: ExpoConfig = {
  name: 'Beyond Every Art',
  slug: 'beyond-every-art-companion',
  version: '0.1.0',
  orientation: 'default',
  // PROPOSED — the owner confirms the scheme, like the identifiers below,
  // before any store record exists.
  scheme: 'beyondeveryart',
  userInterfaceStyle: 'automatic',
  ios: {
    // PROPOSED — owner confirms ownership before any store record.
    bundleIdentifier: 'com.beyondeveryart.companion',
    supportsTablet: true,
  },
  android: {
    // PROPOSED — owner confirms ownership before any store record.
    package: 'com.beyondeveryart.companion',
  },
  plugins: [
    'expo-router',
    'expo-sqlite',
    ['expo-splash-screen', { backgroundColor: '#f6f2eb' }],
  ],
  // No `extra.eas.projectId`: there is no EAS project, and creating one waits
  // on the owner (docs/COMPANION_APP.md, owner checklist).
  extra: { apiBaseUrl, siteUrl, fixtureSet },
}

export default config
