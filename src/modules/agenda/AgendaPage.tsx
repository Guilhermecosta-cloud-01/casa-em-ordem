import { ChevronLeft, ChevronRight, MapPin, Plus, Repeat } from 'lucide-react'
import { useMemo, useState } from 'react'
import { PageBody, PageHeader } from '@/app/AppLayout'
import { Button, IconButton } from '@/components/ui/Button'
import { CheckCircle, PendingMark } from '@/components/ui/CheckCircle'
import { Badge, Segmented } from '@/components/ui/Controls'
import { EmptyState, ErrorState, LoadingBlock, Notice } from '@/components/ui/States'
import { cn } from '@/components/ui/cn'
import { addDays, addMonths, dayLabel, formatTime, monthLabel, startOfMonth } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { todayIso } from '@/lib/format'
import { describeRecurrence } from '@/lib/recurrence'
import { capitalize } from '@/lib/text'
import { MemberChip } from '@/modules/family/MemberSelect'
import { dueLabel } from '@/modules/tasks/domain'
import { useTaskActions, useTasks } from '@/modules/tasks/hooks'
import { type AgendaEntry, agendaEntries, groupByDate, KIND_INFO, monthGrid, overdueTasks, yearsSince } from './domain'
import { EventSheet } from './EventSheet'
import { useEvents } from './hooks'
import type { AgendaEvent } from './types'

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const WEEKDAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

export function AgendaPage() {
  const { events, pendingIds, isLoading, error, refetch, offlineNoData } = useEvents()
  const { tasks } = useTasks()
  const taskActions = useTaskActions()
  const today = todayIso()
  const [view, setView] = useState<'next' | 'month'>('next')
  const [month, setMonth] = useState(startOfMonth(today))
  const [selectedDay, setSelectedDay] = useState(today)
  const [editing, setEditing] = useState<{ event: AgendaEvent | null; occursOn?: string; date?: string } | null>(null)

  const upcoming = useMemo(
    () => groupByDate(agendaEntries(events ?? [], tasks ?? [], today, addDays(today, 60))),
    [events, tasks, today],
  )
  const overdue = useMemo(() => overdueTasks(tasks ?? [], today), [tasks, today])
  const monthEntries = useMemo(() => {
    const grid = monthGrid(month)
    return agendaEntries(events ?? [], tasks ?? [], grid[0]!.date, grid[grid.length - 1]!.date)
  }, [events, tasks, month])
  const byDay = useMemo(() => new Map(groupByDate(monthEntries)), [monthEntries])

  const renderEntry = (entry: AgendaEntry) =>
    entry.type === 'event' ? (
      <EventRow
        key={`${entry.event.id}-${entry.date}`}
        entry={entry}
        pending={pendingIds.has(entry.event.id)}
        onOpen={() => setEditing({ event: entry.event, occursOn: entry.date })}
      />
    ) : (
      <li key={`task-${entry.task.id}`} className="flex items-start gap-3 py-3">
        <CheckCircle checked={false} onToggle={() => taskActions.complete(entry.task)} label={`Marcar ${entry.task.title} como feita`} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{entry.task.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
            <Badge>Tarefa</Badge>
            {entry.task.assignee_id && <MemberChip userId={entry.task.assignee_id} />}
          </p>
        </div>
      </li>
    )

  return (
    <>
      <PageHeader
        title="Agenda"
        actions={
          <Button
            size="sm"
            icon={<Plus className="size-4" />}
            onClick={() => setEditing({ event: null, date: view === 'month' ? selectedDay : today })}
          >
            Novo
          </Button>
        }
      />
      <PageBody className="space-y-5">
        <Segmented
          label="Visualização"
          value={view}
          onChange={setView}
          options={[
            { value: 'next', label: 'Próximos dias' },
            { value: 'month', label: 'Mês' },
          ]}
        />

        {offlineNoData && !events ? (
          <Notice tone="info">Sem internet, e estes dados ainda não estão guardados neste aparelho. Eles aparecem quando a conexão voltar.</Notice>
        ) : isLoading && !events ? (
          <LoadingBlock />
        ) : error && !events ? (
          <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
        ) : view === 'next' ? (
          <>
            {overdue.length > 0 && (
              <section aria-labelledby="atrasadas">
                <h2 id="atrasadas" className="mb-2 text-sm font-bold text-alert">
                  Tarefas atrasadas · {overdue.length}
                </h2>
                <ul className="divide-y divide-line rounded-[var(--radius-panel)] bg-card px-3 ring-1 ring-line">
                  {overdue.map((task) => (
                    <li key={task.id} className="flex items-start gap-3 py-3">
                      <CheckCircle checked={false} onToggle={() => taskActions.complete(task)} label={`Marcar ${task.title} como feita`} />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{task.title}</p>
                        <p className="text-sm font-semibold text-alert">{dueLabel(task.due_on!, today)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {upcoming.length === 0 ? (
              <EmptyState
                title="Nada nos próximos 60 dias"
                action={
                  <Button icon={<Plus className="size-4" />} onClick={() => setEditing({ event: null, date: today })}>
                    Adicionar à agenda
                  </Button>
                }
              >
                Anote compromissos, aniversários, manutenções da casa e produtos para repor. Tarefas com prazo também aparecem aqui.
              </EmptyState>
            ) : (
              upcoming.map(([date, entries]) => (
                <section key={date} aria-labelledby={`dia-${date}`}>
                  <h2 id={`dia-${date}`} className={cn('mb-2 text-sm font-bold', date === today ? 'text-pen' : 'text-ink-2')}>
                    {date === today ? 'Hoje, ' : date === addDays(today, 1) ? 'Amanhã, ' : ''}
                    {dayLabel(date)}
                  </h2>
                  <ul className="divide-y divide-line rounded-[var(--radius-panel)] bg-card px-3 ring-1 ring-line">
                    {entries.map(renderEntry)}
                  </ul>
                </section>
              ))
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <IconButton label="Mês anterior" onClick={() => setMonth((m) => addMonths(m, -1))}>
                <ChevronLeft className="size-6" />
              </IconButton>
              <h2 className="text-lg font-bold" aria-live="polite">
                {capitalize(monthLabel(month))}
              </h2>
              <IconButton label="Próximo mês" onClick={() => setMonth((m) => addMonths(m, 1))}>
                <ChevronRight className="size-6" />
              </IconButton>
            </div>
            <div className="rounded-[var(--radius-panel)] bg-card p-2 ring-1 ring-line">
              <div className="grid grid-cols-7 text-center text-xs font-bold text-ink-2" aria-hidden>
                {WEEKDAYS.map((d, i) => (
                  <span key={i} className="py-1">
                    {d}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-7" role="group" aria-label={`Dias de ${monthLabel(month)}`}>
                {monthGrid(month).map(({ date, inMonth }) => {
                  const count = byDay.get(date)?.length ?? 0
                  const selected = date === selectedDay
                  return (
                    <button
                      key={date}
                      type="button"
                      onClick={() => setSelectedDay(date)}
                      aria-pressed={selected}
                      aria-label={`${Number(date.slice(8))} de ${monthLabel(date)}, ${WEEKDAY_NAMES[new Date(`${date}T12:00:00`).getDay()]}${count ? `, ${count} na agenda` : ''}`}
                      className={cn(
                        'flex min-h-12 flex-col items-center justify-center gap-1 rounded-[var(--radius-field)] text-sm',
                        !inMonth && 'text-ink-3',
                        selected ? 'bg-pen text-on-pen' : date === today ? 'font-bold text-pen ring-1 ring-pen-line' : 'hover:bg-paper',
                      )}
                    >
                      <span>{Number(date.slice(8))}</span>
                      <span className={cn('h-1.5 w-1.5 rounded-full', count ? (selected ? 'bg-on-pen' : 'bg-pen') : 'bg-transparent')} />
                    </button>
                  )
                })}
              </div>
            </div>
            <section aria-labelledby="dia-escolhido">
              <h2 id="dia-escolhido" className="mb-2 text-sm font-bold text-ink-2">
                {capitalize(dayLabel(selectedDay))}
              </h2>
              {(byDay.get(selectedDay) ?? []).length === 0 ? (
                <p className="text-ink-2">Nada neste dia.</p>
              ) : (
                <ul className="divide-y divide-line rounded-[var(--radius-panel)] bg-card px-3 ring-1 ring-line">
                  {(byDay.get(selectedDay) ?? []).map(renderEntry)}
                </ul>
              )}
            </section>
          </>
        )}
      </PageBody>
      <EventSheet
        key={editing ? `${editing.event?.id ?? 'new'}-${editing.occursOn ?? editing.date ?? ''}` : 'none'}
        open={editing !== null}
        event={editing?.event ?? null}
        occursOn={editing?.occursOn ?? null}
        defaultDate={editing?.date}
        onClose={() => setEditing(null)}
      />
    </>
  )
}

function EventRow({ entry, pending, onOpen }: { entry: Extract<AgendaEntry, { type: 'event' }>; pending: boolean; onOpen: () => void }) {
  const { event, date } = entry
  const info = KIND_INFO[event.kind]
  const years = event.kind === 'important_date' && event.recurrence === 'yearly' ? yearsSince(event.starts_on, date) : 0
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 py-3 text-left">
        <span className="w-14 shrink-0 pt-0.5 text-sm font-semibold tabular text-ink-2">
          {event.start_time ? formatTime(event.start_time) : 'Dia todo'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">
            <span aria-hidden>{info.emoji}</span> {event.title}
            {years > 0 && <span className="font-normal text-ink-2"> · {years} anos</span>}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
            <span>{info.label}</span>
            {event.end_time && <span>até {formatTime(event.end_time)}</span>}
            {event.recurrence !== 'none' && (
              <span className="inline-flex items-center gap-1">
                <Repeat className="size-4" aria-hidden />
                {describeRecurrence(event.recurrence, event.recurrence_interval)}
              </span>
            )}
            {event.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-4" aria-hidden />
                {event.location}
              </span>
            )}
            <PendingMark pending={pending} />
          </span>
        </span>
      </button>
    </li>
  )
}
