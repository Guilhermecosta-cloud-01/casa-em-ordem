import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { unwrap } from '@/lib/errors'
import { newId } from '@/lib/id'
import { usePollInterval, useTableRealtime } from '@/lib/realtime'
import { supabase } from '@/lib/supabase'
import { defineRowSync } from '@/lib/sync/rowSync'
import { useActiveFamily } from '@/modules/family/FamilyProvider'
import type { AgendaEvent, EventFields, EventLog } from './types'

export const agendaKey = (familyId: string) => ['agenda', familyId] as const

export const eventSync = defineRowSync<AgendaEvent>({
  kind: 'event',
  table: 'events',
  queryKey: agendaKey,
  toRow: (row, userId) =>
    ({
      notes: null,
      location: null,
      start_time: null,
      end_time: null,
      recurrence: 'none',
      recurrence_interval: 1,
      until_on: null,
      remind_minutes: null,
      product_id: null,
      stock_item_id: null,
      created_by: userId,
      updated_by: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...row,
    }) as AgendaEvent,
})

export function useEvents() {
  const family = useActiveFamily()
  const queryClient = useQueryClient()
  const live = useTableRealtime({
    channel: `agenda:${family.id}`,
    tables: [{ table: 'events', filter: `family_id=eq.${family.id}` }],
    onChange: () => void queryClient.invalidateQueries({ queryKey: agendaKey(family.id) }),
    isMine: (id) => Boolean(queryClient.getQueryData<AgendaEvent[]>(agendaKey(family.id))?.some((e) => e.id === id)),
  })
  const refetchInterval = usePollInterval(live)
  const query = useQuery({
    queryKey: agendaKey(family.id),
    queryFn: async () =>
      unwrap(await supabase.from('events').select('*').eq('family_id', family.id).order('starts_on')) as AgendaEvent[],
    refetchInterval,
  })
  const { rows, pendingIds } = eventSync.useRows(family.id, query.data)
  return { ...query, events: rows, pendingIds, offlineNoData: query.fetchStatus === 'paused' && query.data === undefined }
}

export function useEventLogs(eventId: string | null) {
  return useQuery({
    queryKey: ['agenda', 'logs', eventId],
    enabled: Boolean(eventId),
    queryFn: async () =>
      unwrap(
        await supabase.from('event_logs').select('*').eq('event_id', eventId!).order('done_on', { ascending: false }).limit(20),
      ) as EventLog[],
  })
}

export function useEventActions() {
  const family = useActiveFamily()
  const queryClient = useQueryClient()
  const create = useCallback(
    (fields: EventFields) => {
      const id = newId()
      eventSync.insert(family.id, { id, family_id: family.id, ...fields }, fields.title)
      return id
    },
    [family.id],
  )
  const update = useCallback(
    (event: AgendaEvent, patch: Partial<EventFields>) => eventSync.update(family.id, event.id, patch, event.title),
    [family.id],
  )
  const remove = useCallback((event: AgendaEvent) => eventSync.remove(family.id, event.id, event.title), [family.id])
  const logDone = useMutation({
    mutationFn: async (input: { event: AgendaEvent; occursOn: string | null; doneOn: string; notes?: string | null }) =>
      unwrap(
        await supabase.from('event_logs').insert({
          id: newId(),
          family_id: family.id,
          event_id: input.event.id,
          occurs_on: input.occursOn,
          done_on: input.doneOn,
          notes: input.notes ?? null,
        }),
      ),
    onSuccess: (_, input) => void queryClient.invalidateQueries({ queryKey: ['agenda', 'logs', input.event.id] }),
  })
  return { create, update, remove, logDone }
}
