import { ArrowRight, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { PageBody, PageHeader } from '@/app/AppLayout'
import { Button, IconButton } from '@/components/ui/Button'
import { PendingMark } from '@/components/ui/CheckCircle'
import { useConfirm } from '@/components/ui/Confirm'
import { PriceTag } from '@/components/ui/PriceTag'
import { EmptyState, ErrorState, LoadingBlock, Notice } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/components/ui/cn'
import { addMonths, startOfMonth } from '@/lib/dates'
import { toBig } from '@/lib/decimal'
import { errorMessage } from '@/lib/errors'
import { formatDate, formatMoney, formatPercent, todayIso } from '@/lib/format'
import { capitalize } from '@/lib/text'
import { monthLabel } from '@/lib/dates'
import { useFamily } from '@/modules/family/FamilyProvider'
import { MemberChip } from '@/modules/family/MemberSelect'
import { expenseCategory, monthChange, suggestSettlements, summarizeMonth } from './domain'
import { type ExpenseDraft, ExpenseSheet } from './ExpenseSheet'
import { useBalances, useExpenseActions, useExpenses, useMonthTotal, useSettlements } from './hooks'
import type { Expense } from './types'

export function ExpensesPage() {
  const [params, setParams] = useSearchParams()
  const [month, setMonth] = useState(() => startOfMonth(params.get('data') ?? todayIso()))
  const { expenses, pendingIds, isLoading, error, refetch, offlineNoData } = useExpenses(month)
  const previous = useMonthTotal(addMonths(month, -1))
  const [editing, setEditing] = useState<Expense | 'new' | null>(() => (params.get('nova') ? 'new' : null))
  const [draft] = useState<ExpenseDraft | undefined>(() =>
    params.get('nova')
      ? {
          description: params.get('descricao') ?? undefined,
          amount: params.get('valor') ?? undefined,
          spent_on: params.get('data') ?? undefined,
          category: params.get('categoria') ?? undefined,
          purchase_id: params.get('compra'),
        }
      : undefined,
  )

  const summary = useMemo(() => summarizeMonth(expenses ?? []), [expenses])
  const previousTotal = useMemo(() => summarizeMonth(previous.data ?? []).total, [previous.data])
  const change = previous.data ? monthChange(summary.total, previousTotal) : null
  const max = summary.byCategory[0]?.total

  const byDay = useMemo(() => {
    const groups = new Map<string, Expense[]>()
    for (const e of expenses ?? []) groups.set(e.spent_on, [...(groups.get(e.spent_on) ?? []), e])
    return [...groups.entries()]
  }, [expenses])

  function closeSheet() {
    setEditing(null)
    if (params.get('nova')) setParams({}, { replace: true })
  }

  return (
    <>
      <PageHeader
        title="Despesas"
        actions={
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            Lançar
          </Button>
        }
      />
      <PageBody className="space-y-6">
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

        {offlineNoData && !expenses ? (
          <Notice tone="info">Sem internet, e estes dados ainda não estão guardados neste aparelho. Eles aparecem quando a conexão voltar.</Notice>
        ) : isLoading && !expenses ? (
          <LoadingBlock />
        ) : error && !expenses ? (
          <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
        ) : (
          <>
            <section className="space-y-4 rounded-[var(--radius-panel)] bg-card p-4 ring-1 ring-line" aria-label="Resumo do mês">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <PriceTag value={summary.total} label="Total do mês" size="lg" />
                <p className="text-sm text-ink-2">
                  {change === null
                    ? previous.data && previousTotal.eq(0)
                      ? 'Sem lançamentos no mês anterior para comparar.'
                      : ''
                    : change.abs().lt(0.5)
                      ? 'Igual ao mês anterior.'
                      : `${formatPercent(change.abs())} ${change.gt(0) ? 'a mais' : 'a menos'} que no mês anterior (${formatMoney(previousTotal)}).`}
                </p>
              </div>
              {summary.byCategory.length > 0 && max && (
                <div>
                  <h3 className="mb-2 text-sm font-bold text-ink-2">Por categoria</h3>
                  <ul className="space-y-2.5">
                    {summary.byCategory.map((c) => (
                      <li key={c.id}>
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="truncate">
                            <span aria-hidden>{c.emoji}</span> {c.label}
                          </span>
                          <span className="tabular font-semibold">{formatMoney(c.total)}</span>
                        </div>
                        <div className="mt-1 h-2 rounded-full bg-paper" aria-hidden>
                          <div
                            className="h-2 rounded-full bg-pen"
                            style={{ width: `${Math.max(2, Number(c.total.div(max).times(100).toFixed(1)))}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {summary.byPayer.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-bold text-ink-2">Quem pagou</h3>
                  <ul className="space-y-1.5 text-sm">
                    {summary.byPayer.map((p) => (
                      <li key={p.userId ?? 'casa'} className="flex items-center justify-between gap-3">
                        {p.userId ? <MemberChip userId={p.userId} /> : <span>Dinheiro da casa</span>}
                        <span className="tabular font-semibold">{formatMoney(p.total)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <BalancesSection />

            <section aria-labelledby="lancamentos">
              <h2 id="lancamentos" className="mb-2 text-lg font-bold">
                Lançamentos
              </h2>
              {byDay.length === 0 ? (
                <EmptyState
                  title="Nenhuma despesa neste mês"
                  action={
                    <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
                      Lançar despesa
                    </Button>
                  }
                >
                  Registre contas, compras e gastos da casa. Dá para dividir entre os integrantes.
                </EmptyState>
              ) : (
                <div className="space-y-4">
                  {byDay.map(([day, list]) => (
                    <div key={day}>
                      <h3 className="mb-1.5 text-sm font-bold text-ink-2">{formatDate(day)}</h3>
                      <ul className="divide-y divide-line rounded-[var(--radius-panel)] bg-card px-3 ring-1 ring-line">
                        {list.map((e) => (
                          <ExpenseRow key={e.id} expense={e} pending={pendingIds.has(e.id)} onOpen={() => setEditing(e)} />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </PageBody>
      <ExpenseSheet
        key={editing === 'new' ? 'new' : editing?.id ?? 'none'}
        open={editing !== null}
        expense={editing === 'new' ? null : editing}
        draft={editing === 'new' ? draft : undefined}
        onClose={closeSheet}
      />
    </>
  )
}

function ExpenseRow({ expense, pending, onOpen }: { expense: Expense; pending: boolean; onOpen: () => void }) {
  const { nameOf } = useFamily()
  const category = expenseCategory(expense.category)
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 py-3 text-left">
        <span className="mt-0.5 text-xl" aria-hidden>
          {category.emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{expense.description}</span>
          <span className="mt-0.5 block text-sm text-ink-2">
            {expense.paid_by ? `Pago por ${nameOf(expense.paid_by, { you: 'lower' })}` : 'Dinheiro da casa'}
            {expense.split_mode !== 'none' && ` · dividida por ${expense.expense_shares.length}`}
            {expense.created_by && expense.created_by !== expense.paid_by && ` · lançada por ${nameOf(expense.created_by, { you: 'lower' })}`}
          </span>
          <PendingMark pending={pending} />
        </span>
        <span className="tabular font-semibold">{formatMoney(expense.amount)}</span>
      </button>
    </li>
  )
}

function BalancesSection() {
  const balances = useBalances()
  const settlements = useSettlements()
  const { nameOf } = useFamily()
  const actions = useExpenseActions()
  const confirm = useConfirm()
  const toast = useToast()
  const steps = useMemo(() => suggestSettlements(balances.data ?? []), [balances.data])
  const hasShared = (balances.data ?? []).some((b) => !toBig(b.paid).eq(0) || !toBig(b.owed).eq(0))

  if (!balances.data || !hasShared) return null

  async function settle(step: (typeof steps)[number]) {
    const ok = await confirm({
      title: 'Registrar acerto?',
      message: `${nameOf(step.from)} pagou ${formatMoney(step.amount)} para ${nameOf(step.to, { you: 'lower' })}.`,
      confirmLabel: 'Registrar',
    })
    if (!ok) return
    actions.settle.mutate(
      { from_user: step.from, to_user: step.to, amount: step.amount.toFixed(2) },
      { onSuccess: () => toast.success('Acerto registrado.'), onError: (e) => toast.error(errorMessage(e)) },
    )
  }

  return (
    <section aria-labelledby="saldos" className="space-y-3 rounded-[var(--radius-panel)] bg-card p-4 ring-1 ring-line">
      <h2 id="saldos" className="text-lg font-bold">
        Quem deve a quem
      </h2>
      <p className="text-sm text-ink-2">Considera todas as despesas divididas e os acertos já feitos.</p>
      {steps.length === 0 ? (
        <p className="font-semibold text-leaf">Tudo certo: ninguém deve nada.</p>
      ) : (
        <ul className="space-y-2">
          {steps.map((step) => (
            <li key={`${step.from}-${step.to}`} className="flex flex-wrap items-center gap-x-2 gap-y-2">
              <span className="font-semibold">{nameOf(step.from)}</span>
              <ArrowRight className="size-4 text-ink-3" aria-label="paga para" />
              <span className="font-semibold">{nameOf(step.to)}</span>
              <span className="tabular font-bold">{formatMoney(step.amount)}</span>
              <Button size="sm" variant="secondary" className="ml-auto" loading={actions.settle.isPending} onClick={() => void settle(step)}>
                Registrar acerto
              </Button>
            </li>
          ))}
        </ul>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold text-pen">Saldo de cada pessoa</summary>
        <ul className="mt-2 space-y-1">
          {(balances.data ?? []).map((b) => {
            const value = toBig(b.balance)
            return (
              <li key={b.user_id} className="flex items-center justify-between gap-3">
                <MemberChip userId={b.user_id} />
                <span className={cn('tabular font-semibold', value.gt(0) ? 'text-leaf' : value.lt(0) ? 'text-alert' : 'text-ink-2')}>
                  {value.gt(0) ? `a receber ${formatMoney(value)}` : value.lt(0) ? `deve ${formatMoney(value.abs())}` : 'zerado'}
                </span>
              </li>
            )
          })}
        </ul>
        {(settlements.data ?? []).length > 0 && (
          <>
            <h3 className="mt-3 font-semibold">Acertos recentes</h3>
            <ul className="mt-1 space-y-1">
              {(settlements.data ?? []).slice(0, 10).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3">
                  <span>
                    {formatDate(s.settled_on)}: {nameOf(s.from_user)} → {nameOf(s.to_user)}
                  </span>
                  <span className="tabular">{formatMoney(s.amount)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </details>
    </section>
  )
}
