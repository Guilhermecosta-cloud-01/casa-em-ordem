import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { unwrap } from '@/lib/errors'
import { usePollInterval, useTableRealtime } from '@/lib/realtime'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/modules/auth/AuthProvider'

export type NotificationKind = 'chat' | 'task' | 'stock' | 'expense' | 'event'

export interface AppNotification {
  id: string
  family_id: string | null
  user_id: string
  kind: NotificationKind
  title: string
  body: string | null
  url: string | null
  ref_id: string | null
  actor_id: string | null
  created_at: string
  read_at: string | null
}

export interface NotificationPreferences {
  user_id: string
  chat: boolean
  tasks: boolean
  stock: boolean
  expenses: boolean
  agenda: boolean
}

export const notificationsKey = (userId: string) => ['notifications', userId] as const

/** Avisos da pessoa (as mensagens de conversa ficam nas próprias conversas). */
export function useNotifications(options: { live?: boolean } = {}) {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const queryClient = useQueryClient()
  const live = useTableRealtime({
    channel: userId && options.live ? `notifications:${userId}` : null,
    tables: [{ table: 'notifications', filter: `user_id=eq.${userId}` }],
    onChange: () => void queryClient.invalidateQueries({ queryKey: notificationsKey(userId) }),
  })
  const poll = usePollInterval(live)
  return useQuery({
    queryKey: notificationsKey(userId),
    enabled: Boolean(userId),
    queryFn: async () =>
      unwrap(
        await supabase
          .from('notifications')
          .select('*')
          .neq('kind', 'chat')
          .order('created_at', { ascending: false })
          .limit(100),
      ) as AppNotification[],
    refetchInterval: options.live ? poll : false,
  })
}

export function useUnreadNotificationsCount(): number {
  const query = useNotifications({ live: true })
  return useMemo(() => (query.data ?? []).filter((n) => !n.read_at).length, [query.data])
}

export function useNotificationActions() {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: notificationsKey(userId) })
  const markRead = useMutation({
    mutationFn: async (ids: string[]) =>
      unwrap(await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids).is('read_at', null)),
    onSuccess: invalidate,
  })
  const clearRead = useMutation({
    mutationFn: async () =>
      unwrap(await supabase.from('notifications').delete().not('read_at', 'is', null).neq('kind', 'chat')),
    onSuccess: invalidate,
  })
  return { markRead, clearRead }
}

const DEFAULT_PREFS = { chat: true, tasks: true, stock: true, expenses: true, agenda: true }

export function usePreferences() {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['notification-preferences', userId],
    enabled: Boolean(userId),
    queryFn: async () =>
      (unwrap(await supabase.from('notification_preferences').select('*').eq('user_id', userId).maybeSingle()) as
        | NotificationPreferences
        | null) ?? { user_id: userId, ...DEFAULT_PREFS },
  })
  const save = useMutation({
    mutationFn: async (prefs: Omit<NotificationPreferences, 'user_id'>) =>
      unwrap(await supabase.from('notification_preferences').upsert({ user_id: userId, ...prefs })),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['notification-preferences', userId] }),
  })
  return { ...query, save }
}
