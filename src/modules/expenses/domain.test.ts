import { describe, expect, it } from 'vitest'
import { Big } from '@/lib/decimal'
import { monthChange, splitEqually, suggestSettlements, summarizeMonth } from './domain'
import type { Expense } from './types'

const expense = (patch: Partial<Expense>): Expense => ({
  id: 'e',
  family_id: 'f',
  description: 'x',
  category: 'outros',
  amount: 10,
  spent_on: '2026-11-01',
  paid_by: null,
  split_mode: 'none',
  purchase_id: null,
  notes: null,
  created_by: null,
  updated_by: null,
  created_at: '',
  updated_at: '',
  expense_shares: [],
  ...patch,
})

describe('despesas', () => {
  it('divide igualmente em centavos, como o banco', () => {
    expect(splitEqually(new Big('100'), 3).map((v) => v.toFixed(2))).toEqual(['33.34', '33.33', '33.33'])
    expect(splitEqually(new Big('0.05'), 2).map((v) => v.toFixed(2))).toEqual(['0.03', '0.02'])
    expect(splitEqually(new Big('90'), 2).map((v) => v.toFixed(2))).toEqual(['45.00', '45.00'])
  })

  it('resume o mês por categoria e por quem pagou, sem erro de arredondamento', () => {
    const summary = summarizeMonth([
      expense({ amount: '0.10', category: 'mercado', paid_by: 'a' }),
      expense({ amount: '0.20', category: 'mercado', paid_by: 'b' }),
      expense({ amount: 50, category: 'contas', paid_by: 'a' }),
    ])
    expect(summary.total.toFixed(2)).toBe('50.30')
    expect(summary.byCategory.map((c) => [c.id, c.total.toFixed(2)])).toEqual([
      ['contas', '50.00'],
      ['mercado', '0.30'],
    ])
    expect(summary.byPayer[0]).toMatchObject({ userId: 'a' })
  })

  it('compara com o mês anterior', () => {
    expect(monthChange(new Big(110), new Big(100))!.toFixed(1)).toBe('10.0')
    expect(monthChange(new Big(110), new Big(0))).toBeNull()
  })

  it('sugere poucos acertos que zeram os saldos', () => {
    const steps = suggestSettlements([
      { user_id: 'ana', balance: 60 },
      { user_id: 'bruno', balance: -40 },
      { user_id: 'dani', balance: -20 },
    ])
    expect(steps.map((s) => [s.from, s.to, s.amount.toFixed(2)])).toEqual([
      ['bruno', 'ana', '40.00'],
      ['dani', 'ana', '20.00'],
    ])
    expect(suggestSettlements([{ user_id: 'ana', balance: 0 }])).toEqual([])
  })
})
