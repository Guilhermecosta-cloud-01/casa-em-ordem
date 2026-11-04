import { Big, toBig } from '@/lib/decimal'
import type { Balance, Expense } from './types'

export const EXPENSE_CATEGORIES = [
  { id: 'mercado', label: 'Mercado', emoji: '🛒' },
  { id: 'moradia', label: 'Moradia', emoji: '🏠' },
  { id: 'contas', label: 'Contas (água, luz, internet)', emoji: '💡' },
  { id: 'transporte', label: 'Transporte', emoji: '🚗' },
  { id: 'saude', label: 'Saúde', emoji: '🩺' },
  { id: 'educacao', label: 'Educação', emoji: '📚' },
  { id: 'lazer', label: 'Lazer', emoji: '🎉' },
  { id: 'pets', label: 'Pets', emoji: '🐾' },
  { id: 'vestuario', label: 'Roupas e calçados', emoji: '👕' },
  { id: 'outros', label: 'Outros', emoji: '🧾' },
] as const

export function expenseCategory(id: string): { id: string; label: string; emoji: string } {
  return EXPENSE_CATEGORIES.find((c) => c.id === id) ?? { id: 'outros', label: 'Outros', emoji: '🧾' }
}

/**
 * Divisão igual em centavos, como no banco: os centavos que sobram vão para
 * os primeiros da lista (R$ 100 ÷ 3 = 33,34 + 33,33 + 33,33).
 */
export function splitEqually(amount: Big, count: number): Big[] {
  if (count < 1) return []
  const cents = Number(amount.times(100).round(0, Big.roundHalfUp).toString())
  const base = Math.floor(cents / count)
  const rest = cents - base * count
  return Array.from({ length: count }, (_, i) => new Big(base + (i < rest ? 1 : 0)).div(100))
}

export function sumAmounts(values: (number | string | Big)[]): Big {
  return values.reduce<Big>((total, v) => total.plus(toBig(v)), new Big(0))
}

export interface MonthSummary {
  total: Big
  byCategory: { id: string; label: string; emoji: string; total: Big }[]
  byPayer: { userId: string | null; total: Big }[]
}

export function summarizeMonth(expenses: Expense[]): MonthSummary {
  const total = sumAmounts(expenses.map((e) => e.amount))
  const categories = new Map<string, Big>()
  const payers = new Map<string | null, Big>()
  for (const e of expenses) {
    categories.set(e.category, (categories.get(e.category) ?? new Big(0)).plus(toBig(e.amount)))
    payers.set(e.paid_by, (payers.get(e.paid_by) ?? new Big(0)).plus(toBig(e.amount)))
  }
  return {
    total,
    byCategory: [...categories.entries()]
      .map(([id, value]) => ({ ...expenseCategory(id), id, total: value }))
      .sort((a, b) => b.total.cmp(a.total)),
    byPayer: [...payers.entries()].map(([userId, value]) => ({ userId, total: value })).sort((a, b) => b.total.cmp(a.total)),
  }
}

/** Variação percentual em relação ao mês anterior (null sem base para comparar). */
export function monthChange(current: Big, previous: Big): Big | null {
  if (previous.eq(0)) return null
  return current.minus(previous).div(previous).times(100)
}

export interface SettleStep {
  from: string
  to: string
  amount: Big
}

/**
 * Sugestão de acertos para zerar os saldos com o menor número de
 * pagamentos: quem mais deve paga para quem mais tem a receber.
 */
export function suggestSettlements(balances: Pick<Balance, 'user_id' | 'balance'>[]): SettleStep[] {
  const creditors = balances
    .map((b) => ({ id: b.user_id, value: toBig(b.balance) }))
    .filter((b) => b.value.gt(0))
    .sort((a, b) => b.value.cmp(a.value))
  const debtors = balances
    .map((b) => ({ id: b.user_id, value: toBig(b.balance).times(-1) }))
    .filter((b) => b.value.gt(0))
    .sort((a, b) => b.value.cmp(a.value))
  const steps: SettleStep[] = []
  let i = 0
  let j = 0
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i]!
    const creditor = creditors[j]!
    const amount = debtor.value.lt(creditor.value) ? debtor.value : creditor.value
    if (amount.gte(0.01)) steps.push({ from: debtor.id, to: creditor.id, amount })
    debtor.value = debtor.value.minus(amount)
    creditor.value = creditor.value.minus(amount)
    if (debtor.value.lt(0.01)) i += 1
    if (creditor.value.lt(0.01)) j += 1
  }
  return steps
}
