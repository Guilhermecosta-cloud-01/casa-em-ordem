import { Bell, BellOff, Boxes, CalendarDays, CheckCheck, MessageCircle, SquareCheckBig, Wallet } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { PageBody, PageHeader } from '@/app/AppLayout'
import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/Field'
import { EmptyState, ErrorState, LoadingBlock, Notice } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/components/ui/cn'
import { errorMessage } from '@/lib/errors'
import { formatRelative } from '@/lib/format'
import { type AppNotification, type NotificationKind, useNotificationActions, useNotifications, usePreferences } from './hooks'
import { currentSubscription, disablePush, enablePush, pushSupport } from './push'

const ICONS: Record<NotificationKind, ReactNode> = {
  chat: <MessageCircle className="size-5" />,
  task: <SquareCheckBig className="size-5" />,
  stock: <Boxes className="size-5" />,
  expense: <Wallet className="size-5" />,
  event: <CalendarDays className="size-5" />,
}

export function NotificationsPage() {
  const notifications = useNotifications()
  const actions = useNotificationActions()
  const navigate = useNavigate()
  const unread = (notifications.data ?? []).filter((n) => !n.read_at)

  function open(n: AppNotification) {
    if (!n.read_at) actions.markRead.mutate([n.id])
    if (n.url) navigate(n.url)
  }

  return (
    <>
      <PageHeader title="Notificações" back="/mais" />
      <PageBody className="space-y-8">
        <section aria-labelledby="avisos" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="avisos" className="text-lg font-bold">
              Avisos
            </h2>
            <div className="flex gap-2">
              {unread.length > 0 && (
                <Button size="sm" variant="secondary" icon={<CheckCheck className="size-4" />} onClick={() => actions.markRead.mutate(unread.map((n) => n.id))}>
                  Marcar como lidos
                </Button>
              )}
              {(notifications.data ?? []).some((n) => n.read_at) && (
                <Button size="sm" variant="ghost" onClick={() => actions.clearRead.mutate()}>
                  Limpar lidos
                </Button>
              )}
            </div>
          </div>
          {notifications.isLoading && !notifications.data ? (
            <LoadingBlock />
          ) : notifications.error && !notifications.data ? (
            <ErrorState message={errorMessage(notifications.error)} onRetry={() => void notifications.refetch()} />
          ) : (notifications.data ?? []).length === 0 ? (
            <EmptyState title="Nenhum aviso" icon={<Bell className="size-6" />}>
              Tarefas atribuídas a você, itens acabando no estoque, despesas divididas e lembretes da agenda aparecem aqui.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-panel)] bg-card ring-1 ring-line">
              {(notifications.data ?? []).map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => open(n)} className={cn('flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-paper', !n.read_at && 'bg-pen-soft/50')}>
                    <span className={cn('mt-0.5', n.read_at ? 'text-ink-3' : 'text-pen')} aria-hidden>
                      {ICONS[n.kind]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn('block', n.read_at ? 'font-semibold' : 'font-bold')}>
                        {!n.read_at && <span className="sr-only">Novo: </span>}
                        {n.title}
                      </span>
                      {n.body && <span className="block text-sm text-ink-2">{n.body}</span>}
                      <span className="block text-xs text-ink-2">{formatRelative(n.created_at)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <PushSection />
      </PageBody>
    </>
  )
}

function PushSection() {
  const support = pushSupport()
  const prefs = usePreferences()
  const toast = useToast()
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const denied = typeof Notification !== 'undefined' && Notification.permission === 'denied'

  useEffect(() => {
    void currentSubscription().then((s) => setEnabled(Boolean(s)))
  }, [])

  async function toggle() {
    setBusy(true)
    try {
      if (enabled) {
        await disablePush()
        setEnabled(false)
        toast.success('Este aparelho não recebe mais notificações.')
      } else {
        const result = await enablePush()
        setEnabled(result === 'granted')
        if (result === 'granted') toast.success('Pronto! Este aparelho vai receber as notificações.')
        else toast.error('O navegador não permitiu notificações.')
      }
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const values = prefs.data
  const update = (key: 'chat' | 'tasks' | 'stock' | 'expenses' | 'agenda', value: boolean) => {
    if (!values) return
    const { user_id: _ignored, ...rest } = values
    prefs.save.mutate({ ...rest, [key]: value }, { onError: (e) => toast.error(errorMessage(e)) })
  }

  return (
    <section aria-labelledby="celular" className="space-y-3">
      <h2 id="celular" className="text-lg font-bold">
        No celular
      </h2>
      {support === 'unconfigured' ? (
        <Notice tone="info">
          As notificações no celular ainda não foram configuradas neste app. Quem administra a publicação segue o passo a passo em
          docs/NOTIFICACOES.md. Os avisos acima continuam funcionando.
        </Notice>
      ) : support === 'needs-install' ? (
        <Notice tone="info">
          No iPhone, as notificações só funcionam com o app instalado: no Safari, toque em Compartilhar → Adicionar à Tela de Início e abra o
          app por lá.
        </Notice>
      ) : support === 'unsupported' ? (
        <Notice tone="warn">Este navegador não recebe notificações. Tente pelo Chrome no Android ou pelo app instalado no iPhone.</Notice>
      ) : (
        <div className="space-y-4 rounded-[var(--radius-panel)] bg-card p-4 ring-1 ring-line">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 flex-1">
              {enabled ? 'Este aparelho recebe notificações.' : 'Receba avisos mesmo com o app fechado.'}
            </p>
            <Button
              variant={enabled ? 'secondary' : 'primary'}
              icon={enabled ? <BellOff className="size-5" /> : <Bell className="size-5" />}
              loading={busy || enabled === null}
              disabled={denied && !enabled}
              onClick={() => void toggle()}
            >
              {enabled ? 'Desativar neste aparelho' : 'Ativar neste aparelho'}
            </Button>
          </div>
          {denied && !enabled && (
            <Notice tone="warn">As notificações foram bloqueadas no navegador. Libere nas configurações do site e volte aqui.</Notice>
          )}
          {values && (
            <fieldset className="space-y-3 border-t border-line pt-4">
              <legend className="mb-2 font-semibold">O que receber</legend>
              <Switch checked={values.chat} onChange={(v) => update('chat', v)} label="Mensagens das conversas" />
              <Switch checked={values.tasks} onChange={(v) => update('tasks', v)} label="Tarefas atribuídas e do dia" />
              <Switch checked={values.agenda} onChange={(v) => update('agenda', v)} label="Lembretes da agenda" />
              <Switch checked={values.stock} onChange={(v) => update('stock', v)} label="Itens acabando no estoque" />
              <Switch checked={values.expenses} onChange={(v) => update('expenses', v)} label="Despesas divididas com você" />
            </fieldset>
          )}
        </div>
      )}
    </section>
  )
}
