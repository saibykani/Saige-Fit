import { useEffect } from 'react';
import { connectHealth, disconnectHealth, refreshHealth, syncHealth, useHealthStore } from './healthConnect';

/** Health Connect (Android). A no-op reporting status 'unavailable' on web, iOS and when the native module is missing. */
export function useHealthConnect() {
  const s = useHealthStore();
  useEffect(() => { if (!s.loaded) refreshHealth(); }, [s.loaded]);
  return {
    status: s.status, connected: s.status === 'connected', busy: s.busy, error: s.error,
    snapshot: s.snapshot, lastSynced: s.lastSynced,
    connect: connectHealth, disconnect: disconnectHealth, sync: syncHealth, refresh: refreshHealth,
  };
}
