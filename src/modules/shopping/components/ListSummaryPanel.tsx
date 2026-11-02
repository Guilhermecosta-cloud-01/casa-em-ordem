import { Pencil } from 'lucide-react'
import { ProgressBar } from '@/components/ui/Controls'
import { cn } from '@/components/ui/cn'
import { PriceTag } from '@/components/ui/PriceTag'
import { toBigOrNull } from '@/lib/decimal'
import { formatDate, formatMoney } from '@/lib/format'
import { budgetStatus, type ListTotals } from '../domain/totals'
import type { Purchase, ShoppingList } from '../types'

export function ListSummaryPanel({
  list,
  totals,
  purchase,
  onEditBudget,
}: {
  list: ShoppingList
  totals: ListTotals
  purchase: Purchase | null | undefined
  onEditBudget: () => void
}) {
  const budget = budgetStatus(list.budget, totals.estimated)
  const paid = toBigOrNull(purchase?.paid_total ?? null)
  const purchasedEstimate = toBigOrNull(purchase?.estimated_total ?? null)

  return (
    <section aria-label="Resumo da lista" className="rounded-[var(--radius-panel)] bg-card p-4 ring-1 ring-line">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PriceTag value={totals.estimated} label="Total estimado" size="lg" />
        <div className="min-w-40 flex-1 text-right">
          <p className="text-[0.9375rem] font-semibold">
            <span className="tabular">{totals.purchasedCount}</span> de <span className="tabular">{totals.itemsCount}</span>{' '}
            {totals.itemsCount === 1 ? 'item comprado' : 'itens comprados'}
          </p>
          <div className="mt-2">
            <ProgressBar value={totals.progress} label="Progresso da compra" />
          </div>
          <p className="mt-1 text-sm text-ink-2 tabular">{Math.round(totals.progress * 100)}% da lista</p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[0.9375rem]">
        <div>
          <dt className="text-ink-2">No carrinho</dt>
          <dd className="font-tag text-xl font-semibold tabular text-leaf">{formatMoney(totals.purchased)}</dd>
        </div>
        <div>
          <dt className="text-ink-2">Falta comprar</dt>
          <dd className="font-tag text-xl font-semibold tabular">{formatMoney(totals.pending)}</dd>
        </div>
      </dl>
      <div className="mt-3">
            <button
              type="button"
              onClick={onEditBudget}
              className={cn(
                'flex w-full items-center justify-between gap-3 rounded-[var(--radius-field)] px-3 py-2.5 text-left',
                !budget && 'bg-paper text-ink-2',
                budget && !budget.over && 'bg-leaf-soft',
                budget?.over && 'bg-alert-soft',
              )}
            >
              {budget ? (
                <span>
                  <span className="block">
                    Orçamento <span className="font-semibold tabular">{formatMoney(budget.budget)}</span>
                  </span>
                  <span className={cn('block font-semibold', budget.over ? 'text-alert' : 'text-leaf')}>
                    {budget.over
                      ? `Passou ${formatMoney(budget.difference.abs())} do orçamento`
                      : `Sobram ${formatMoney(budget.difference)}`}
                  </span>
                </span>
              ) : (
                <span>Definir orçamento para esta lista</span>
              )}
              <Pencil className="size-4 shrink-0 text-pen" aria-hidden />
            </button>
      </div>

      {totals.unpricedCount > 0 && (
        <p className="mt-3 text-sm text-ink-2">
          {totals.unpricedCount === 1
            ? '1 item sem preço não entra no total.'
            : `${totals.unpricedCount} itens sem preço não entram no total.`}
        </p>
      )}

      {purchase && (
        <div className="mt-4 rounded-[var(--radius-field)] bg-pen-soft px-3 py-3 text-[0.9375rem]">
          <p className="font-semibold">Compra finalizada em {formatDate(purchase.purchased_on)}</p>
          {paid ? (
            <p className="mt-0.5">
              Valor pago: <strong className="tabular">{formatMoney(paid)}</strong>
              {purchasedEstimate && !paid.eq(purchasedEstimate) && (
                <>
                  {' '}
                  ({formatMoney(paid.minus(purchasedEstimate).abs())} {paid.gt(purchasedEstimate) ? 'acima' : 'abaixo'} do estimado
                  para os itens comprados)
                </>
              )}
            </p>
          ) : (
            <p className="mt-0.5 text-ink-2">Valor final não informado.</p>
          )}
        </div>
      )}
    </section>
  )
}
