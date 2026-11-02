import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { itemsKey } from './offline'
import type { ListItem } from './types'

export type LiveStatus = 'connecting' | 'live' | 'unavailable'

/**
 * Atualizações em tempo real de uma lista. Cada mudança feita por outro
 * integrante "avisa" este aparelho, que recarrega a lista do servidor
 * (sempre a versão oficial). Se o Realtime não conectar, a tela passa a
 * consultar periodicamente (ver useListItems).
 */
export function useListRealtime(listId: string | undefined): LiveStatus {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<LiveStatus>('connecting')

  useEffect(() => {
    if (!listId) return
    setStatus('connecting')
    let debounce: ReturnType<typeof setTimeout> | undefined
    const refresh = () => {
      clearTimeout(debounce)
      debounce = setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: itemsKey(listId) })
        void queryClient.invalidateQueries({ queryKey: ['list', listId] })
        void queryClient.invalidateQueries({ queryKey: ['summaries'] })
      }, 250)
    }

    const channel = supabase
      .channel(`list:${listId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'list_items', filter: `list_id=eq.${listId}` }, refresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'list_items', filter: `list_id=eq.${listId}` }, refresh)
      // Exclusões não aceitam filtro no Realtime: chega só o id, e conferimos
      // se o item é desta lista.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'list_items' }, (payload) => {
        const id = (payload.old as { id?: string } | null)?.id
        const cached = queryClient.getQueryData<ListItem[]>(itemsKey(listId))
        if (id && cached?.some((item) => item.id === id)) refresh()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'shopping_lists', filter: `id=eq.${listId}` }, refresh)
      .subscribe((state) => {
        if (state === 'SUBSCRIBED') setStatus('live')
        else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED') setStatus('unavailable')
      })

    const fallback = setTimeout(() => setStatus((s) => (s === 'connecting' ? 'unavailable' : s)), 8000)
    return () => {
      clearTimeout(debounce)
      clearTimeout(fallback)
      void supabase.removeChannel(channel)
    }
  }, [listId, queryClient])

  return status
}
