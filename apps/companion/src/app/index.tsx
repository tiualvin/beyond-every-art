import { Redirect } from 'expo-router'

/** The app opens on Today. */
export default function Index() {
  return <Redirect href="/today" />
}
