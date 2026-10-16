// Tells the query cache when the device goes offline and comes back, so reads
// pause rather than fail, and refetch on reconnect.

import { onlineManager } from '@tanstack/react-query'
import { addNetworkStateListener } from 'expo-network'

export function connectOnlineManager(): void {
  onlineManager.setEventListener((setOnline) => {
    const subscription = addNetworkStateListener((state) => {
      // Unknown reachability counts as online: refusing to try is worse than
      // one failed request.
      setOnline(
        state.isConnected !== false && state.isInternetReachable !== false,
      )
    })
    return () => subscription.remove()
  })
}
