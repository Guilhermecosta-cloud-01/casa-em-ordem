import { useEffect, useRef, useState } from 'react'
import { env } from './env'
import { supabase } from './supabase'
import { useOnline } from './sync/hooks'

export type LiveStatus = 'connecting' | 'live' | 'unavailable'

/**
 * Avisos em tempo real de uma ou mais tabelas da família. Cada mudança faz
 * a tela recarregar do servidor (a versão oficial). Exclusões não aceitam
 * filtro no Realtime: chega só o id, e `isMine` diz se interessa.
 */
export function useTableRealtime(options: {
  channel: string | null
  tables: { table: string; filter?: string }[]
  onChange: () => void
  isMine?: (id: string) => boolean
}): LiveStatus {
  const [status, setStatus] = useState<LiveStatus>('connecting')
  const onChange = useRef(options.onChange)
  const isMine = useRef(options.isMine)
  onChange.current = options.onChange
  isMine.current = options.isMine
  const key = options.channel ? `${options.channel}|${JSON.stringify(options.tables)}` : null

  useEffect(() => {
    if (!key || !options.channel) return
    setStatus('connecting')
    let debounce: ReturnType<typeof setTimeout> | undefined
    const refresh = () => {
      clearTimeout(debounce)
      debounce = setTimeout(() => onChange.current(), 250)
    }
    let channel = supabase.channel(options.channel)
    for (const { table, filter } of options.tables) {
      channel = channel
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table, ...(filter ? { filter } : {}) }, refresh)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table, ...(filter ? { filter } : {}) }, refresh)
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, (payload) => {
          const id = (payload.old as { id?: string } | null)?.id
          if (id && (isMine.current ? isMine.current(id) : true)) refresh()
        })
    }
    channel.subscribe((state) => {
      if (state === 'SUBSCRIBED') setStatus('live')
      else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED') setStatus('unavailable')
    })
    const fallback = setTimeout(() => setStatus((s) => (s === 'connecting' ? 'unavailable' : s)), 8000)
    return () => {
      clearTimeout(debounce)
      clearTimeout(fallback)
      void supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return status
}

/** Consulta periódica quando o tempo real não está conectado (e há internet). */
export function usePollInterval(live: LiveStatus): number | false {
  const online = useOnline()
  return live === 'live' || !online ? false : env.syncPollMs
}
