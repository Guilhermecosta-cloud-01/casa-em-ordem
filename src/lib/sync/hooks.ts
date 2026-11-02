import { useEffect, useState, useSyncExternalStore } from 'react'
import { getOutboxSnapshot, type OutboxSnapshot, subscribeOutbox } from './outbox'

export function useOutbox(): OutboxSnapshot {
  return useSyncExternalStore(subscribeOutbox, getOutboxSnapshot, getOutboxSnapshot)
}

/** Estado de conexão do navegador (com eventos online/offline). */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

export type SyncState = 'synced' | 'syncing' | 'pending' | 'offline' | 'auth' | 'error'

export function useSyncState(userId: string | null): {
  state: SyncState
  pending: number
  failed: number
  snapshot: OutboxSnapshot
} {
  const snapshot = useOutbox()
  const online = useOnline()
  const pending = snapshot.ops.filter((op) => op.userId === userId).length
  const failed = snapshot.failed.filter((op) => op.userId === userId).length
  let state: SyncState = 'synced'
  if (failed > 0) state = 'error'
  else if (pending > 0 && snapshot.pausedReason === 'auth') state = 'auth'
  else if (pending > 0 && (!online || snapshot.pausedReason === 'offline')) state = 'offline'
  else if (pending > 0 && snapshot.flushing) state = 'syncing'
  else if (pending > 0) state = 'pending'
  else if (!online) state = 'offline'
  return { state, pending, failed, snapshot }
}
