import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { QueryClient } from '@tanstack/react-query'
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
  throttleTime: 1000,
})

export const persistOptions = {
  persister,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  buster: env.appVersion,
  dehydrateOptions: {
    shouldDehydrateQuery: (query: { queryKey: readonly unknown[]; state: { status: string } }) =>
      query.state.status === 'success' && PERSISTED_KEYS.has(String(query.queryKey[0])),
  },
}

/** Apaga o cache local (ao sair da conta). */
export async function clearLocalCache(): Promise<void> {
  queryClient.clear()
  await persister.removeClient()
}
