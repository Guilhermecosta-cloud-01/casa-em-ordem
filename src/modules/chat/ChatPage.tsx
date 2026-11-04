import { Clock, SendHorizontal } from 'lucide-react'
import { type FormEvent, type KeyboardEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { PageBody, PageHeader } from '@/app/AppLayout'
import { Button, IconButton } from '@/components/ui/Button'
import { ActionSheet } from '@/components/ui/Sheet'
import { ErrorState, LoadingBlock } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/components/ui/cn'
import { addDays } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { formatDate, todayIso } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { unwrap } from '@/lib/errors'
import { useOnline } from '@/lib/sync/hooks'
import { useAuth } from '@/modules/auth/AuthProvider'
import { useFamily } from '@/modules/family/FamilyProvider'
import { type ChatMessage, useChatActions, useChatOverview, useMarkRead, useMessages } from './hooks'

function dayTitle(iso: string): string {
  const day = iso.slice(0, 10)
  const today = todayIso()
  if (day === today) return 'Hoje'
  if (day === addDays(today, -1)) return 'Ontem'
  return formatDate(day)
}

function localDay(timestamp: string): string {
  const d = new Date(timestamp)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function timeOf(timestamp: string): string {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp))
}

export function ChatPage() {
  const { conversationId = '' } = useParams()
  const overview = useChatOverview()
  const { messages, pendingIds, isLoading, error, refetch, hasMore } = useMessages(conversationId)
  const actions = useChatActions()
  const { user } = useAuth()
  const { nameOf } = useFamily()
  const toast = useToast()
  const online = useOnline()
  const [text, setText] = useState('')
  const [older, setOlder] = useState<ChatMessage[]>([])
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [noMore, setNoMore] = useState(false)
  const [menu, setMenu] = useState<ChatMessage | null>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const lastCount = useRef(0)

  const conversation = overview.data?.find((c) => c.conversation_id === conversationId)
  const isGroup = conversation?.kind !== 'direct'
  const title = conversation
    ? conversation.kind === 'group'
      ? 'Grupo da família'
      : conversation.other_user_id
        ? nameOf(conversation.other_user_id, { you: false })
        : 'Ex-integrante'
    : 'Conversa'

  const all = useMemo(() => {
    const ids = new Set((messages ?? []).map((m) => m.id))
    return [...older.filter((m) => !ids.has(m.id)), ...(messages ?? [])]
  }, [older, messages])

  const lastServerId = useMemo(() => [...(messages ?? [])].reverse().find((m) => !pendingIds.has(m.id))?.id, [messages, pendingIds])
  useMarkRead(conversationId, lastServerId)

  // Rola para a última mensagem ao abrir e quando chega mensagem nova.
  useLayoutEffect(() => {
    if (!messages) return
    const grew = messages.length > lastCount.current
    const first = lastCount.current === 0
    lastCount.current = messages.length
    if (!grew) return
    const nearBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 240
    const mine = messages[messages.length - 1]?.author_id === user?.id
    if (first || nearBottom || mine) window.scrollTo({ top: document.documentElement.scrollHeight })
  }, [messages, user?.id])

  useEffect(() => {
    const el = textarea.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [text])

  function send(e?: FormEvent) {
    e?.preventDefault()
    if (!text.trim()) return
    try {
      actions.send(conversationId, text)
      setText('')
      textarea.current?.focus()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      send()
    }
  }

  async function loadOlder() {
    const oldest = all[0]?.created_at
    if (!oldest) return
    setLoadingOlder(true)
    try {
      const rows = (
        unwrap(
          await supabase
            .from('chat_messages')
            .select('id, family_id, conversation_id, author_id, body, created_at, deleted_at')
            .eq('conversation_id', conversationId)
            .lt('created_at', oldest)
            .order('created_at', { ascending: false })
            .limit(100),
        ) as ChatMessage[]
      ).reverse()
      if (rows.length < 100) setNoMore(true)
      setOlder((list) => [...rows, ...list])
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setLoadingOlder(false)
    }
  }

  let lastDay = ''
  return (
    <>
      <PageHeader title={title} back="/conversas" />
      <PageBody className="pb-28">
        {isLoading && !messages ? (
          <LoadingBlock />
        ) : error && !messages ? (
          <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
        ) : (
          <div className="space-y-1.5" role="log" aria-label={`Mensagens: ${title}`} aria-live="polite">
            {hasMore && !noMore && online && (
              <div className="pb-2 text-center">
                <Button size="sm" variant="ghost" loading={loadingOlder} onClick={() => void loadOlder()}>
                  Ver mensagens anteriores
                </Button>
              </div>
            )}
            {all.length === 0 && (
              <p className="py-10 text-center text-ink-2">
                {isGroup ? 'Comece a conversa do grupo da família.' : 'Mande a primeira mensagem.'}
              </p>
            )}
            {all.map((m, i) => {
              const day = localDay(m.created_at)
              const showDay = day !== lastDay
              lastDay = day
              const mine = m.author_id === user?.id
              const previous = all[i - 1]
              const showAuthor = isGroup && !mine && (showDay || previous?.author_id !== m.author_id)
              const pending = pendingIds.has(m.id)
              return (
                <div key={m.id}>
                  {showDay && (
                    <p className="py-3 text-center text-xs font-bold uppercase tracking-wide text-ink-2">{dayTitle(day)}</p>
                  )}
                  <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                    <button
                      type="button"
                      disabled={!mine || Boolean(m.deleted_at) || pending}
                      onClick={() => setMenu(m)}
                      className={cn(
                        'max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-left disabled:cursor-default',
                        mine ? 'rounded-br-md bg-pen text-white' : 'rounded-bl-md bg-card ring-1 ring-line',
                        m.deleted_at && 'italic opacity-70',
                      )}
                    >
                      {showAuthor && m.author_id && (
                        <span className="mb-0.5 block text-xs font-bold text-pen">{nameOf(m.author_id, { you: false })}</span>
                      )}
                      <span className="sr-only">{mine ? 'Você' : nameOf(m.author_id, { you: false })}: </span>
                      {m.deleted_at ? 'Mensagem apagada' : m.body}
                      <span className={cn('mt-0.5 flex items-center justify-end gap-1 text-[0.6875rem]', mine ? 'text-white/80' : 'text-ink-2')}>
                        {pending && <Clock className="size-3" aria-label="aguardando envio" />}
                        {timeOf(m.created_at)}
                      </span>
                    </button>
                  </div>
                </div>
              )
            })}
            <div ref={bottom} />
          </div>
        )}
      </PageBody>
      <form
        onSubmit={send}
        className="fixed inset-x-0 bottom-[calc(4rem+1px+env(safe-area-inset-bottom))] z-20 border-t border-line bg-paper lg:bottom-0 lg:left-64"
      >
        <div className="mx-auto flex max-w-3xl items-end gap-2 px-4 py-2">
        <label htmlFor="chat-input" className="sr-only">
          Mensagem
        </label>
        <textarea
          id="chat-input"
          ref={textarea}
          rows={1}
          value={text}
          maxLength={4000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Mensagem"
          className="max-h-40 min-h-12 flex-1 resize-none rounded-[var(--radius-field)] border-[1.5px] border-line-strong bg-card px-4 py-3 text-base outline-none focus:border-pen"
        />
        <IconButton type="submit" label="Enviar" tone="pen" size="lg" disabled={!text.trim()}>
          <SendHorizontal className="size-6" />
        </IconButton>
        </div>
      </form>
      <ActionSheet
        open={menu !== null}
        onClose={() => setMenu(null)}
        title="Mensagem"
        actions={
          menu
            ? [
                {
                  label: 'Apagar para todos',
                  tone: 'danger',
                  disabled: !online,
                  description: online ? undefined : 'Precisa de internet.',
                  onSelect: () =>
                    actions.remove.mutate(menu.id, {
                      onSuccess: () => toast.success('Mensagem apagada.'),
                      onError: (err) => toast.error(errorMessage(err)),
                    }),
                },
              ]
            : []
        }
      />
    </>
  )
}
