import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { unwrap } from '@/lib/errors'
import { newId } from '@/lib/id'
import { usePollInterval, useTableRealtime } from '@/lib/realtime'
import { supabase } from '@/lib/supabase'
import { useOnline } from '@/lib/sync/hooks'
import { defineRowSync } from '@/lib/sync/rowSync'
import { useFamily } from '@/modules/family/FamilyProvider'

export interface ChatMessage {
  id: string
  family_id: string
  conversation_id: string
  author_id: string | null
  body: string
  created_at: string
  deleted_at: string | null
}

export interface ConversationSummary {
  conversation_id: string
  kind: 'group' | 'direct'
  other_user_id: string | null
  last_message_at: string | null
  last_body: string | null
  last_author_id: string | null
  last_deleted: boolean
  unread_count: number
}

export const overviewKey = (familyId: string) => ['chat-overview', familyId] as const
export const messagesKey = (familyId: string, conversationId: string) => ['chat-messages', familyId, conversationId] as const

export const chatSync = defineRowSync<ChatMessage>({
  kind: 'chat',
  table: 'chat_messages',
  queryKey: (familyId) => ['chat-messages', familyId],
  alsoInvalidate: (familyId) => [overviewKey(familyId)],
  toRow: (row, userId) =>
    ({ author_id: userId, created_at: new Date().toISOString(), deleted_at: null, ...row }) as ChatMessage,
})

/**
 * Conversas da família com a última mensagem e as não lidas. Só um lugar do
 * app (a navegação) assina o tempo real (`live`); as telas usam o mesmo cache.
 */
export function useChatOverview(options: { live?: boolean } = {}) {
  const { family } = useFamily()
  const familyId = family?.id ?? ''
  const queryClient = useQueryClient()
  const live = useTableRealtime({
    channel: familyId && options.live ? `chat:${familyId}` : null,
    tables: [{ table: 'chat_messages', filter: `family_id=eq.${familyId}` }],
    onChange: () => {
      void queryClient.invalidateQueries({ queryKey: overviewKey(familyId) })
      void queryClient.invalidateQueries({ queryKey: ['chat-messages', familyId] })
    },
  })
  const poll = usePollInterval(live)
  const refetchInterval = options.live ? poll : false
  return useQuery({
    queryKey: overviewKey(familyId),
    enabled: Boolean(familyId),
    queryFn: async () =>
      unwrap(await supabase.rpc('chat_overview', { p_family_id: familyId })) as ConversationSummary[],
    refetchInterval,
  })
}

export function useUnreadChatCount(): number {
  const overview = useChatOverview({ live: true })
  return useMemo(() => (overview.data ?? []).reduce((sum, c) => sum + c.unread_count, 0), [overview.data])
}

const PAGE = 100

export function useMessages(conversationId: string) {
  const { family } = useFamily()
  const familyId = family?.id ?? ''
  const query = useQuery({
    queryKey: messagesKey(familyId, conversationId),
    enabled: Boolean(familyId && conversationId),
    queryFn: async () => {
      const rows = unwrap(
        await supabase
          .from('chat_messages')
          .select('id, family_id, conversation_id, author_id, body, created_at, deleted_at')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: false })
          .limit(PAGE),
      ) as ChatMessage[]
      return rows.reverse()
    },
  })
  const { rows, pendingIds } = chatSync.useRows(familyId, query.data)
  const messages = useMemo(
    () => rows?.filter((m) => m.conversation_id === conversationId).sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [rows, conversationId],
  )
  return { ...query, messages, pendingIds, hasMore: (query.data?.length ?? 0) >= PAGE }
}

export function useChatActions() {
  const { family } = useFamily()
  const familyId = family?.id ?? ''
  const queryClient = useQueryClient()
  const send = useCallback(
    (conversationId: string, body: string) => {
      const text = body.trim().slice(0, 4000)
      if (!text) return
      chatSync.insert(familyId, { id: newId(), family_id: familyId, conversation_id: conversationId, body: text }, text.slice(0, 40))
    },
    [familyId],
  )
  const remove = useMutation({
    mutationFn: async (messageId: string) => unwrap(await supabase.rpc('delete_chat_message', { p_message_id: messageId })),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['chat-messages', familyId] }),
  })
  const openGroup = useMutation({
    mutationFn: async () => unwrap(await supabase.rpc('open_group_conversation', { p_family_id: familyId })) as string,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: overviewKey(familyId) }),
  })
  const openDirect = useMutation({
    mutationFn: async (otherUserId: string) =>
      unwrap(await supabase.rpc('open_direct_conversation', { p_family_id: familyId, p_other_user: otherUserId })) as string,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: overviewKey(familyId) }),
  })
  return { send, remove, openGroup, openDirect }
}

/** Marca a conversa como lida ao abrir e sempre que chegar mensagem com a tela visível. */
export function useMarkRead(conversationId: string, lastMessageId: string | undefined) {
  const { family } = useFamily()
  const queryClient = useQueryClient()
  const online = useOnline()
  const last = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!online || !conversationId || !lastMessageId || last.current === lastMessageId) return
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    last.current = lastMessageId
    void supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId }).then(() => {
      void queryClient.invalidateQueries({ queryKey: overviewKey(family?.id ?? '') })
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
    })
  }, [conversationId, lastMessageId, online, family?.id, queryClient])
}
