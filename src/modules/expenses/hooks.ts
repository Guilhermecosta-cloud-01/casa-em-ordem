import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { endOfMonth, startOfMonth } from '@/lib/dates'
import { unwrap } from '@/lib/errors'
import { newId } from '@/lib/id'
import { usePollInterval, useTableRealtime } from '@/lib/realtime'
import { supabase } from '@/lib/supabase'
import { defineRowSync } from '@/lib/sync/rowSync'
import { useActiveFamily } from '@/modules/family/FamilyProvider'
import { splitEqually } from './domain'
import type { Balance, Expense, ExpenseInput, Settlement } from './types'
import { toBig } from '@/lib/decimal'

const SELECT = '*, expense_shares(user_id, amount)'

async function fetchMonth(familyId: string, month: string): Promise<Expense[]> {
  return unwrap(
    await supabase
      .from('expenses')
      .select(SELECT)
      .eq('family_id', familyId)
      .gte('spent_on', startOfMonth(month))
      .lte('spent_on', endOfMonth(month))
      .order('spent_on', { ascending: false })
      .order('created_at', { ascending: false }),
  ) as Expense[]
}

/** Linha completa a partir do que foi enviado (para aparecer na hora, mesmo offline). */
function toExpense(input: ExpenseInput & { family_id: string }, userId: string): Expense {
  const shares =
    input.split_mode === 'equal'
      ? splitEqually(toBig(input.amount), (input.participants as string[]).length).map((amount, i) => ({
          user_id: (input.participants as string[])[i]!,
          amount: amount.toString(),
        }))
      : input.split_mode === 'custom'
        ? (input.participants as { user_id: string; amount: string }[])
        : []
  const now = new Date().toISOString()
  return {
    id: input.id,
    family_id: input.family_id,
    description: input.description,
    category: input.category,
    amount: input.amount,
    spent_on: input.spent_on,
    paid_by: input.paid_by,
    split_mode: input.split_mode,
    purchase_id: input.purchase_id,
    notes: input.notes,
    created_by: userId,
    updated_by: userId,
    created_at: now,
    updated_at: now,
    expense_shares: shares,
  }
}

export const expenseSync = defineRowSync<Expense>({
  kind: 'expense',
  table: 'expenses',
  queryKey: (familyId) => ['expenses', familyId],
  alsoInvalidate: (familyId) => [['expense-balances', familyId]],
  toRow: (row) => row as unknown as Expense,
  custom: {
    save: {
      send: async (op) => {
        const input = op.payload.args as unknown as ExpenseInput & { family_id: string }
        unwrap(
          await supabase.rpc('save_expense', {
            p_id: input.id,
            p_family_id: input.family_id,
            p_description: input.description,
            p_category: input.category,
            p_amount: input.amount,
            p_spent_on: input.spent_on,
            p_paid_by: input.paid_by,
            p_split_mode: input.split_mode,
            p_participants: input.participants,
            p_notes: input.notes,
            p_purchase_id: input.purchase_id,
          }),
        )
      },
      apply: (rows, op) => {
        const input = op.payload.args as unknown as ExpenseInput & { family_id: string }
        const existing = rows.find((r) => r.id === input.id)
        const next = { ...toExpense(input, op.userId), created_by: existing?.created_by ?? op.userId, created_at: existing?.created_at ?? new Date().toISOString() }
        return existing ? rows.map((r) => (r.id === input.id ? next : r)) : [next, ...rows]
      },
    },
  },
})

export function useExpenses(month: string) {
  const family = useActiveFamily()
  const queryClient = useQueryClient()
  const live = useTableRealtime({
    channel: `expenses:${family.id}`,
    tables: [
      { table: 'expenses', filter: `family_id=eq.${family.id}` },
      { table: 'expense_settlements', filter: `family_id=eq.${family.id}` },
    ],
    onChange: () => {
      void queryClient.invalidateQueries({ queryKey: ['expenses', family.id] })
      void queryClient.invalidateQueries({ queryKey: ['expense-balances', family.id] })
    },
  })
  const refetchInterval = usePollInterval(live)
  const query = useQuery({
    queryKey: ['expenses', family.id, month],
    queryFn: () => fetchMonth(family.id, month),
    refetchInterval,
  })
  const { rows, pendingIds } = expenseSync.useRows(family.id, query.data)
  const start = startOfMonth(month)
  const end = endOfMonth(month)
  const expenses = useMemo(
    () =>
      rows
        ?.filter((e) => e.spent_on >= start && e.spent_on <= end)
        .sort((a, b) => b.spent_on.localeCompare(a.spent_on) || b.created_at.localeCompare(a.created_at)),
    [rows, start, end],
  )
  return { ...query, expenses, pendingIds, offlineNoData: query.fetchStatus === 'paused' && query.data === undefined }
}

export function useMonthTotal(month: string) {
  const family = useActiveFamily()
  return useQuery({ queryKey: ['expenses', family.id, month], queryFn: () => fetchMonth(family.id, month) })
}

export function useBalances() {
  const family = useActiveFamily()
  return useQuery({
    queryKey: ['expense-balances', family.id],
    queryFn: async () =>
      unwrap(await supabase.from('expense_balances').select('*').eq('family_id', family.id)) as Balance[],
  })
}

export function useSettlements() {
  const family = useActiveFamily()
  return useQuery({
    queryKey: ['expenses', family.id, 'settlements'],
    queryFn: async () =>
      unwrap(
        await supabase
          .from('expense_settlements')
          .select('*')
          .eq('family_id', family.id)
          .order('settled_on', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(30),
      ) as Settlement[],
  })
}

export function useExpenseActions() {
  const family = useActiveFamily()
  const queryClient = useQueryClient()
  const save = useCallback(
    (input: Omit<ExpenseInput, 'id'> & { id?: string }) => {
      const id = input.id ?? newId()
      expenseSync.custom('save', family.id, id, { ...input, id, family_id: family.id }, input.description)
      return id
    },
    [family.id],
  )
  const remove = useCallback((expense: Expense) => expenseSync.remove(family.id, expense.id, expense.description), [family.id])
  const settle = useMutation({
    mutationFn: async (input: { from_user: string; to_user: string; amount: string; notes?: string | null }) =>
      unwrap(await supabase.from('expense_settlements').insert({ id: newId(), family_id: family.id, ...input })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['expense-balances', family.id] })
      void queryClient.invalidateQueries({ queryKey: ['expenses', family.id, 'settlements'] })
    },
  })
  const removeSettlement = useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.from('expense_settlements').delete().eq('id', id)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['expense-balances', family.id] })
      void queryClient.invalidateQueries({ queryKey: ['expenses', family.id, 'settlements'] })
    },
  })
  return { save, remove, settle, removeSettlement }
}
