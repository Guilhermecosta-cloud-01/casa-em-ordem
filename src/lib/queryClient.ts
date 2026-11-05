import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { QueryClient } from '@tanstack/react-query'
import { persistQueryClientSave } from '@tanstack/react-query-persist-client'
import { del, get, set } from 'idb-keyval'
import { env } from './env'
import { isAuthError, isNetworkError } from './errors'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Mantém os dados por uma semana para consulta offline.
      gcTime: 7 * 24 * 60 * 60 * 1000,
      // Tenta mesmo quando o navegador acha que está offline (o sinal do
      // navegador nem sempre é confiável); se falhar, os dados em cache ficam.
      networkMode: 'offlineFirst',
      retry: (failureCount, error) => {
        if (isAuthError(error)) return false
        if (isNetworkError(error)) return failureCount < 1
        return failureCount < 1
      },
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: {
      networkMode: 'always',
      retry: false,
    },
  },
})

/** Chaves de consulta que ficam salvas no aparelho para uso offline. */
const PERSISTED_KEYS = new Set([
  'tasks',
  'stock',
  'expenses',
  'expense-balances',
  'agenda',
  'chat-overview',
  'chat-messages',
  'notifications',
  'categories',
  'families',
  'members',
  'lists',
  'list',
  'items',
  'summaries',
  'products',
  'product-stats',
  'stores',
  'purchases',
  'profile',
])

export const CACHE_KEY = 'casa-em-ordem-cache-v1'

export const persister = createAsyncStoragePersister({
  key: CACHE_KEY,
  storage: {
    getItem: (key) => get<string>(key).then((v) => v ?? null),
    setItem: (key, value) => set(key, value),
    removeItem: (key) => del(key),
  },
  throttleTime: 250,
})

export const persistOptions = {
  persister,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  buster: env.appVersion,
  dehydrateOptions: {
    // Guarda toda consulta que tenha dados, inclusive as que falharam na última
    // tentativa (ex.: sem internet): os dados anteriores continuam válidos para
    // consulta offline.
    shouldDehydrateQuery: (query: { queryKey: readonly unknown[]; state: { data: unknown } }) =>
      query.state.data !== undefined && PERSISTED_KEYS.has(String(query.queryKey[0])),
  },
}

/**
 * Grava o cache agora, sem esperar o intervalo normal. Chamado quando o app
 * vai para segundo plano ou é fechado (o sistema pode encerrá-lo a seguir).
 */
export function flushPersistedCache(): Promise<void> {
  return persistQueryClientSave({ queryClient, ...persistOptions })
}

if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushPersistedCache()
  })
  window.addEventListener('pagehide', () => void flushPersistedCache())
  // Ao reconectar, confere tudo com o servidor (inclusive o que parecia recente).
  window.addEventListener('online', () => void queryClient.invalidateQueries())
}

/** Apaga o cache local (ao sair da conta). */
export async function clearLocalCache(): Promise<void> {
  queryClient.clear()
  await persister.removeClient()
}
