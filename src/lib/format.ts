import { Big, type Decimalish, roundCents, toBig } from './decimal'

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const percent2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** R$ 1.234,56 — arredonda em centavos só na apresentação. */
export function formatMoney(value: Decimalish | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  return money.format(Number(roundCents(toBig(value)).toString()))
}

/** Valor sem o símbolo, para campos de edição: 1234.5 → "1.234,50". */
export function formatMoneyInput(value: Decimalish | null | undefined): string {
  if (value === null || value === undefined || value === '') return ''
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Number(roundCents(toBig(value)).toString()),
  )
}

/** 1.5 → "1,5"; 1234 → "1.234"; até `maxDecimals` casas, sem zeros sobrando. */
export function formatNumber(value: Decimalish, maxDecimals = 3): string {
  const rounded = toBig(value).round(maxDecimals, Big.roundHalfUp)
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: maxDecimals }).format(Number(rounded.toString()))
}

/** Número para edição sem separador de milhar: 1234.5 → "1234,5". */
export function formatNumberInput(value: Decimalish | null | undefined, maxDecimals = 3): string {
  if (value === null || value === undefined || value === '') return ''
  return toBig(value).round(maxDecimals, Big.roundHalfUp).toString().replace('.', ',')
}

/** 31.428571 → "31,43%" */
export function formatPercent(value: Decimalish): string {
  return `${percent2.format(Number(toBig(value).round(2, Big.roundHalfUp).toString()))}%`
}

// ---------------------------------------------------------------------------
// Datas. Colunas "date" chegam como "AAAA-MM-DD" e são tratadas como data
// local (sem fuso), para não virar o dia anterior.
// ---------------------------------------------------------------------------

export function parseLocalDate(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}

export function todayIso(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return ''
  const date = typeof value === 'string' && value.length === 10 ? parseLocalDate(value) : new Date(value)
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
}

export function formatDateShort(value: string | Date | null | undefined): string {
  if (!value) return ''
  const date = typeof value === 'string' && value.length === 10 ? parseLocalDate(value) : new Date(value)
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' }).format(date).replace('.', '')
}

export function formatDateLong(value: string | Date | null | undefined): string {
  if (!value) return ''
  const date = typeof value === 'string' && value.length === 10 ? parseLocalDate(value) : new Date(value)
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(date)
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return ''
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

const relative = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })

/** "agora", "há 5 minutos", "ontem", "há 3 dias"… */
export function formatRelative(value: string | Date | null | undefined, now: Date = new Date()): string {
  if (!value) return ''
  const date = new Date(value)
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 45) return 'agora'
  if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute')
  if (abs < 86400) return relative.format(Math.round(seconds / 3600), 'hour')
  if (abs < 86400 * 7) return relative.format(Math.round(seconds / 86400), 'day')
  return formatDate(date)
}

export function greeting(now: Date = new Date()): string {
  const h = now.getHours()
  if (h < 5) return 'Boa noite'
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

/** Primeiro nome, para cumprimentos. */
export function firstName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? ''
}

export function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}
