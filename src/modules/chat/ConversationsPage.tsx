import { ChevronRight, Users } from 'lucide-react'
import { type ReactNode, useMemo } from 'react'
import { useNavigate } from 'react-router'
import { PageBody, PageHeader } from '@/app/AppLayout'
import { Avatar } from '@/components/ui/Avatar'
import { ErrorState, LoadingBlock, Notice } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/components/ui/cn'
import { errorMessage } from '@/lib/errors'
import { formatRelative } from '@/lib/format'
import { useOnline } from '@/lib/sync/hooks'
import { useAuth } from '@/modules/auth/AuthProvider'
import { useFamily } from '@/modules/family/FamilyProvider'
import { type ConversationSummary, useChatActions, useChatOverview } from './hooks'

export function ConversationsPage() {
  const overview = useChatOverview()
  const { members, nameOf, avatarOf, family } = useFamily()
  const { user } = useAuth()
  const actions = useChatActions()
  const navigate = useNavigate()
  const toast = useToast()
  const online = useOnline()

  const group = overview.data?.find((c) => c.kind === 'group')
  const directs = useMemo(() => {
    const byUser = new Map((overview.data ?? []).filter((c) => c.kind === 'direct' && c.other_user_id).map((c) => [c.other_user_id!, c]))
    return members
      .filter((m) => m.user_id !== user?.id)
      .map((m) => ({ userId: m.user_id, conversation: byUser.get(m.user_id) }))
      .sort((a, b) => (b.conversation?.last_message_at ?? '').localeCompare(a.conversation?.last_message_at ?? ''))
  }, [overview.data, members, user?.id])

  async function open(target: { group: true } | { userId: string }, existing?: ConversationSummary) {
    if (existing) {
      navigate(`/conversas/${existing.conversation_id}`)
      return
    }
    try {
      const id = 'group' in target ? await actions.openGroup.mutateAsync() : await actions.openDirect.mutateAsync(target.userId)
      navigate(`/conversas/${id}`)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const preview = (c: ConversationSummary | undefined) => {
    if (!c?.last_message_at) return 'Nenhuma mensagem ainda'
    if (c.last_deleted) return 'Mensagem apagada'
    const who = c.last_author_id === user?.id ? 'Você: ' : c.kind === 'group' && c.last_author_id ? `${nameOf(c.last_author_id, { you: false }).split(' ')[0]}: ` : ''
    return `${who}${c.last_body ?? ''}`
  }

  return (
    <>
      <PageHeader title="Conversas" subtitle={family?.name} />
      <PageBody className="space-y-5">
        {!online && <Notice tone="info">Sem internet: você vê o que já carregou e as mensagens escritas agora vão quando a conexão voltar.</Notice>}
        {overview.isLoading && !overview.data ? (
          <LoadingBlock />
        ) : overview.error && !overview.data ? (
          <ErrorState message={errorMessage(overview.error)} onRetry={() => void overview.refetch()} />
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-panel)] bg-card ring-1 ring-line">
            <ConversationRow
              title="Grupo da família"
              icon={
                <span className="flex size-12 items-center justify-center rounded-full bg-pen-soft text-pen">
                  <Users className="size-6" aria-hidden />
                </span>
              }
              preview={preview(group)}
              when={group?.last_message_at ?? null}
              unread={group?.unread_count ?? 0}
              onOpen={() => void open({ group: true }, group)}
            />
            {directs.map(({ userId, conversation }) => (
              <ConversationRow
                key={userId}
                title={nameOf(userId, { you: false })}
                icon={<Avatar name={nameOf(userId, { you: false })} src={avatarOf(userId)} seed={userId} size="md" />}
                preview={preview(conversation)}
                when={conversation?.last_message_at ?? null}
                unread={conversation?.unread_count ?? 0}
                onOpen={() => void open({ userId }, conversation)}
              />
            ))}
          </ul>
        )}
        {members.length <= 1 && (
          <p className="text-sm text-ink-2">Convide alguém em Família para conversar a dois. O grupo já pode ser usado para anotar recados.</p>
        )}
      </PageBody>
    </>
  )
}

function ConversationRow({
  title,
  icon,
  preview,
  when,
  unread,
  onOpen,
}: {
  title: string
  icon: ReactNode
  preview: string
  when: string | null
  unread: number
  onOpen: () => void
}) {
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-paper">
        {icon}
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className={cn('truncate', unread ? 'font-bold' : 'font-semibold')}>{title}</span>
            {when && <span className="shrink-0 text-xs text-ink-2">{formatRelative(when)}</span>}
          </span>
          <span className="flex items-center justify-between gap-2">
            <span className={cn('truncate text-sm', unread ? 'font-semibold text-ink' : 'text-ink-2')}>{preview}</span>
            {unread > 0 && (
              <span className="shrink-0 rounded-full bg-pen px-2 text-xs font-bold leading-5 text-on-pen">
                {unread}
                <span className="sr-only"> não lidas</span>
              </span>
            )}
          </span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-ink-3" aria-hidden />
      </button>
    </li>
  )
}
