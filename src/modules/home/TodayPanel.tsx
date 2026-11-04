import { Bell, Boxes, CalendarDays, ChevronRight, MessageCircle, SquareCheckBig } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useNavBadges } from '@/app/navBadges'
import { addDays } from '@/lib/dates'
import { todayIso } from '@/lib/format'
import { agendaEntries } from '@/modules/agenda/domain'
import { useEvents } from '@/modules/agenda/hooks'
import { stockStatus } from '@/modules/stock/domain'
import { useStock } from '@/modules/stock/hooks'
import { useTasks } from '@/modules/tasks/hooks'

/** Resumo do dia: tarefas, agenda, estoque, mensagens e avisos. Só aparece o que tem novidade. */
export function TodayPanel() {
  const today = todayIso()
  const { tasks } = useTasks()
  const { events } = useEvents()
  const { items } = useStock()
  const badges = useNavBadges()

  const dueTasks = (tasks ?? []).filter((t) => t.status === 'open' && t.due_on && t.due_on <= today)
  const overdue = dueTasks.filter((t) => t.due_on! < today).length
  const upcoming = agendaEntries(events ?? [], [], today, addDays(today, 7)).slice(0, 3)
  const low = (items ?? []).filter((i) => stockStatus(i) !== 'ok')

  const rows: { key: string; to: string; icon: ReactNode; title: string; detail: string; tone?: 'alert' }[] = []
  if (dueTasks.length > 0) {
    rows.push({
      key: 'tasks',
      to: '/tarefas',
      icon: <SquareCheckBig className="size-5" />,
      title: dueTasks.length === 1 ? '1 tarefa para hoje' : `${dueTasks.length} tarefas para hoje`,
      detail: `${overdue ? `${overdue} atrasada${overdue > 1 ? 's' : ''} · ` : ''}${dueTasks
        .slice(0, 3)
        .map((t) => t.title)
        .join(', ')}`,
      tone: overdue ? 'alert' : undefined,
    })
  }
  if (upcoming.length > 0) {
    rows.push({
      key: 'agenda',
      to: '/agenda',
      icon: <CalendarDays className="size-5" />,
      title: upcoming[0]!.date === today ? 'Hoje na agenda' : 'Próximos na agenda',
      detail: upcoming
        .map((e) => (e.type === 'event' ? `${e.event.title} (${e.date === today ? 'hoje' : e.date === addDays(today, 1) ? 'amanhã' : `${e.date.slice(8)}/${e.date.slice(5, 7)}`})` : ''))
        .filter(Boolean)
        .join(', '),
    })
  }
  if (low.length > 0) {
    rows.push({
      key: 'stock',
      to: '/estoque',
      icon: <Boxes className="size-5" />,
      title: low.length === 1 ? '1 item acabando' : `${low.length} itens acabando`,
      detail: low
        .slice(0, 4)
        .map((i) => i.name)
        .join(', '),
      tone: 'alert',
    })
  }
  if (badges.chat) {
    rows.push({
      key: 'chat',
      to: '/conversas',
      icon: <MessageCircle className="size-5" />,
      title: badges.chat === 1 ? '1 mensagem não lida' : `${badges.chat} mensagens não lidas`,
      detail: 'Abrir conversas',
    })
  }
  if (badges.notifications) {
    rows.push({
      key: 'notifications',
      to: '/notificacoes',
      icon: <Bell className="size-5" />,
      title: badges.notifications === 1 ? '1 aviso novo' : `${badges.notifications} avisos novos`,
      detail: 'Ver avisos',
    })
  }

  if (rows.length === 0) return null
  return (
    <section aria-labelledby="today-title">
      <h2 id="today-title" className="mb-2 text-lg font-bold">
        Hoje na casa
      </h2>
      <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-panel)] bg-card ring-1 ring-line">
        {rows.map((row) => (
          <li key={row.key}>
            <Link to={row.to} className="flex items-center gap-3 px-4 py-3 hover:bg-paper">
              <span className={row.tone === 'alert' ? 'text-alert' : 'text-pen'} aria-hidden>
                {row.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{row.title}</span>
                <span className="block truncate text-sm text-ink-2">{row.detail}</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-ink-3" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
