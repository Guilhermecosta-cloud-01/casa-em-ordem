import { addDays, addMonths, daysBetween } from './dates'

export type Recurrence = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'

export const RECURRENCE_OPTIONS: { value: Recurrence; label: string }[] = [
  { value: 'none', label: 'Não se repete' },
  { value: 'daily', label: 'Diária' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensal' },
  { value: 'yearly', label: 'Anual' },
]

/**
 * Ocorrência n a partir da data-base, sempre calculada da base original
 * (base + n × intervalo), como no banco (app_private.add_recurrence).
 */
export function addRecurrence(base: string, rule: Recurrence, interval: number, n: number): string {
  switch (rule) {
    case 'daily':
      return addDays(base, interval * n)
    case 'weekly':
      return addDays(base, 7 * interval * n)
    case 'monthly':
      return addMonths(base, interval * n)
    case 'yearly':
      return addMonths(base, 12 * interval * n)
    default:
      return base
  }
}

/** Primeira ocorrência depois de `after` (mantendo o ritmo da data-base). */
export function nextAfter(base: string, rule: Recurrence, interval: number, after: string): string {
  if (rule === 'none') return base
  // Estimativa para não percorrer anos de ocorrências uma a uma.
  const approxDays = { daily: 1, weekly: 7, monthly: 30, yearly: 365 }[rule] * interval
  let n = Math.max(1, Math.floor(daysBetween(base, after) / approxDays) - 1)
  let date = addRecurrence(base, rule, interval, n)
  while (date <= after) {
    n += 1
    date = addRecurrence(base, rule, interval, n)
  }
  // Volta se a estimativa passou do ponto.
  while (n > 1 && addRecurrence(base, rule, interval, n - 1) > after) {
    n -= 1
    date = addRecurrence(base, rule, interval, n)
  }
  return date
}

/** Datas de ocorrência entre from e to (inclusive). */
export function occurrencesBetween(
  start: string,
  rule: Recurrence,
  interval: number,
  from: string,
  to: string,
  until?: string | null,
): string[] {
  const last = until && until < to ? until : to
  if (start > last) return []
  if (rule === 'none') return start >= from ? [start] : []
  const result: string[] = []
  let n = 0
  if (start < from) {
    const first = nextAfter(start, rule, interval, addDays(from, -1))
    if (first > last) return []
    // Descobre o n da primeira ocorrência na janela.
    const approxDays = { daily: 1, weekly: 7, monthly: 30, yearly: 365 }[rule] * interval
    n = Math.max(0, Math.floor(daysBetween(start, first) / approxDays) - 1)
    while (addRecurrence(start, rule, interval, n) < first) n += 1
  }
  for (let guard = 0; guard < 1000; guard += 1) {
    const date = addRecurrence(start, rule, interval, n)
    if (date > last) break
    if (date >= from) result.push(date)
    n += 1
  }
  return result
}

export function describeRecurrence(rule: Recurrence, interval: number): string {
  if (rule === 'none') return ''
  if (interval === 1) {
    return { daily: 'Todo dia', weekly: 'Toda semana', monthly: 'Todo mês', yearly: 'Todo ano' }[rule]
  }
  const unit = { daily: 'dias', weekly: 'semanas', monthly: 'meses', yearly: 'anos' }[rule]
  return `A cada ${interval} ${unit}`
}
