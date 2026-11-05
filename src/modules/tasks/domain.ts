import { addDays, daysBetween } from '@/lib/dates'
import { formatDate } from '@/lib/format'
import { compareText } from '@/lib/text'
import type { Task, TaskPriority } from './types'

export const PRIORITY_LABEL: Record<TaskPriority, string> = { low: 'Baixa', normal: 'Normal', high: 'Alta' }
const PRIORITY_ORDER: Record<TaskPriority, number> = { high: 0, normal: 1, low: 2 }

export type DueGroup = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'none'

export const DUE_GROUP_TITLE: Record<DueGroup, string> = {
  overdue: 'Atrasadas',
  today: 'Hoje',
  tomorrow: 'Amanhã',
  week: 'Próximos 7 dias',
  later: 'Mais adiante',
  none: 'Sem prazo',
}

export function dueGroup(dueOn: string | null, today: string): DueGroup {
  if (!dueOn) return 'none'
  if (dueOn < today) return 'overdue'
  if (dueOn === today) return 'today'
  if (dueOn === addDays(today, 1)) return 'tomorrow'
  if (dueOn <= addDays(today, 7)) return 'week'
  return 'later'
}

/** Prazo primeiro (sem prazo no fim), depois prioridade e nome. */
export function compareTasks(a: Task, b: Task): number {
  if (a.due_on !== b.due_on) {
    if (!a.due_on) return 1
    if (!b.due_on) return -1
    return a.due_on < b.due_on ? -1 : 1
  }
  return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || compareText(a.title, b.title)
}

export function groupOpenTasks(tasks: Task[], today: string): { key: DueGroup; title: string; tasks: Task[] }[] {
  const order: DueGroup[] = ['overdue', 'today', 'tomorrow', 'week', 'later', 'none']
  const groups = new Map<DueGroup, Task[]>(order.map((key) => [key, []]))
  for (const task of [...tasks].sort(compareTasks)) groups.get(dueGroup(task.due_on, today))!.push(task)
  return order
    .map((key) => ({ key, title: DUE_GROUP_TITLE[key], tasks: groups.get(key)! }))
    .filter((group) => group.tasks.length > 0)
}

/** "Hoje", "Amanhã", "Ontem", "Atrasada há 3 dias", "sex., 07/11" ou a data completa. */
export function dueLabel(dueOn: string, today: string): string {
  const diff = daysBetween(today, dueOn)
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Amanhã'
  if (diff === -1) return 'Ontem'
  if (diff < -1) return `Atrasada há ${-diff} dias`
  if (diff <= 6) {
    const date = new Date(`${dueOn}T12:00:00`)
    const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(date)
    return `${weekday} ${dueOn.slice(8, 10)}/${dueOn.slice(5, 7)}`
  }
  return formatDate(dueOn)
}

/** Feitas, da mais recente para a mais antiga. */
export function sortDone(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
}
