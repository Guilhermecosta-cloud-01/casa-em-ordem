// Datas "do calendário" (sem fuso) no formato ISO AAAA-MM-DD, como o banco guarda.

export function isoFromDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function toDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}

export function addDays(iso: string, days: number): string {
  const date = toDate(iso)
  date.setDate(date.getDate() + days)
  return isoFromDate(date)
}

/** Soma meses mantendo o dia; se o mês não tiver esse dia, usa o último (31/01 + 1 mês = 28/02). */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number) as [number, number, number]
  const total = y * 12 + (m - 1) + months
  const year = Math.floor(total / 12)
  const month = total - year * 12
  const last = new Date(year, month + 1, 0).getDate()
  return isoFromDate(new Date(year, month, Math.min(d, last)))
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((toDate(toIso).getTime() - toDate(fromIso).getTime()) / 86_400_000)
}

export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}

export function endOfMonth(iso: string): string {
  return addDays(addMonths(startOfMonth(iso), 1), -1)
}

/** "novembro de 2026" */
export function monthLabel(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(toDate(iso))
}

/** "seg., 03/11" → "segunda, 3 de novembro" */
export function dayLabel(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(toDate(iso))
}

export function weekdayIndex(iso: string): number {
  return toDate(iso).getDay()
}

/** "14:30:00" → "14:30" */
export function formatTime(value: string | null | undefined): string {
  return value ? value.slice(0, 5) : ''
}
