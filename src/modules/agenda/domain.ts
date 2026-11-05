import { occurrencesBetween } from '@/lib/recurrence'
import type { Task } from '@/modules/tasks/types'
import type { AgendaEvent, EventKind } from './types'

export const KIND_INFO: Record<EventKind, { label: string; emoji: string; hint: string }> = {
  appointment: { label: 'Compromisso', emoji: '📅', hint: 'Consulta, reunião, festa…' },
  important_date: { label: 'Data importante', emoji: '🎂', hint: 'Aniversário, data especial (repete todo ano)' },
  maintenance: { label: 'Manutenção', emoji: '🛠️', hint: 'Trocar filtro, revisar o ar-condicionado…' },
  restock: { label: 'Reposição', emoji: '🔁', hint: 'Lembrar de comprar algo de tempos em tempos' },
}

export const REMINDER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Sem lembrete' },
  { value: '0', label: 'Na hora' },
  { value: '15', label: '15 minutos antes' },
  { value: '60', label: '1 hora antes' },
  { value: '1440', label: '1 dia antes' },
  { value: '2880', label: '2 dias antes' },
  { value: '10080', label: '1 semana antes' },
]

export type AgendaEntry =
  | { type: 'event'; date: string; time: string | null; event: AgendaEvent }
  | { type: 'task'; date: string; time: null; task: Task }

/** Ocorrências dos compromissos e tarefas com prazo entre duas datas, em ordem. */
export function agendaEntries(events: AgendaEvent[], tasks: Task[], from: string, to: string): AgendaEntry[] {
  const entries: AgendaEntry[] = []
  for (const event of events) {
    for (const date of occurrencesBetween(event.starts_on, event.recurrence, event.recurrence_interval, from, to, event.until_on)) {
      entries.push({ type: 'event', date, time: event.start_time, event })
    }
  }
  for (const task of tasks) {
    if (task.status === 'open' && task.due_on && task.due_on >= from && task.due_on <= to) {
      entries.push({ type: 'task', date: task.due_on, time: null, task })
    }
  }
  return entries.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      // Dia todo primeiro, depois por horário.
      (a.time ?? '').localeCompare(b.time ?? '') ||
      (a.type === 'event' ? a.event.title : a.task.title).localeCompare(b.type === 'event' ? b.event.title : b.task.title),
  )
}

/** Tarefas atrasadas entram no topo da agenda (com o dia em que venceram). */
export function overdueTasks(tasks: Task[], today: string): Task[] {
  return tasks.filter((t) => t.status === 'open' && t.due_on && t.due_on < today)
}

export function groupByDate(entries: AgendaEntry[]): [string, AgendaEntry[]][] {
  const map = new Map<string, AgendaEntry[]>()
  for (const entry of entries) map.set(entry.date, [...(map.get(entry.date) ?? []), entry])
  return [...map.entries()]
}

/** Dias da grade do mês (semanas começando no domingo), com as datas de fora em cinza. */
export function monthGrid(monthStart: string): { date: string; inMonth: boolean }[] {
  const [y, m] = monthStart.split('-').map(Number) as [number, number]
  const first = new Date(y, m - 1, 1)
  const start = new Date(y, m - 1, 1 - first.getDay())
  const days: { date: string; inMonth: boolean }[] = []
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    days.push({ date: iso, inMonth: d.getMonth() === m - 1 })
  }
  // Remove a última semana se ela for toda do mês seguinte.
  return days.slice(35).every((d) => !d.inMonth) ? days.slice(0, 35) : days
}

/** Anos completados numa data importante ("faz 40 anos"), quando a data-base é o nascimento/início. */
export function yearsSince(startsOn: string, occursOn: string): number {
  return Number(occursOn.slice(0, 4)) - Number(startsOn.slice(0, 4))
}
