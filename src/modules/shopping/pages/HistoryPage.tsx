import { ChevronRight } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { PageBody, PageHeader } from '@/app/AppLayout'
import { cn } from '@/components/ui/cn'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { Big } from '@/lib/decimal'
import { errorMessage } from '@/lib/errors'
import { formatDateShort, formatMoney, formatPercent } from '@/lib/format'
import { compareAmounts, groupByMonth, previousSameName, purchaseAmount } from '../domain/history'
import { usePurchases, useStores } from '../hooks'

export function HistoryPage() {
  const purchases = usePurchases()
  const stores = useStores()
  const storeName = useMemo(() => new Map((stores.data ?? []).map((s) => [s.id, s.name])), [stores.data])
  const groups = useMemo(() => groupByMonth(purchases.data ?? [], (p) => p.purchased_on), [purchases.data])

  return (
    <>
      <PageHeader title="Histórico de compras" back="/listas" />
      <PageBody>
        {purchases.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : purchases.isError && !purchases.data ? (
          <ErrorState message={errorMessage(purchases.error)} onRetry={() => void purchases.refetch()} />
        ) : groups.length === 0 ? (
          <EmptyState title="Nenhuma compra finalizada">
            Quando terminar uma compra, use "Finalizar compra" no menu da lista. O valor pago, a data e os preços de cada
            item ficam registrados aqui.
          </EmptyState>
        ) : (
          <div className="space-y-7">
            {groups.map((group) => {
              const total = group.items.reduce((sum, p) => sum.plus(purchaseAmount(p).value), new Big(0))
              return (
                <section key={group.key} aria-labelledby={`month-${group.key}`}>
                  <div className="flex items-baseline justify-between px-1">
                    <h2 id={`month-${group.key}`} className="text-lg font-bold">
                      {group.label}
                    </h2>
                    <p className="text-sm text-ink-2">
                      {group.items.length} {group.items.length === 1 ? 'compra' : 'compras'},{' '}
                      <span className="font-semibold text-ink tabular">{formatMoney(total)}</span>
                    </p>
                  </div>
                  <ul className="mt-2 ruled overflow-hidden rounded-[var(--radius-panel)] bg-card ring-1 ring-line">
                    {group.items.map((purchase) => {
                      const amount = purchaseAmount(purchase)
                      const previous = previousSameName(purchases.data ?? [], purchase)
                      const comparison = previous ? compareAmounts(purchase, previous) : null
                      return (
                        <li key={purchase.id}>
                          <Link to={`/historico/${purchase.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-paper">
                            <div className="w-12 shrink-0 text-center">
                              <span className="block font-tag text-2xl font-bold leading-none tabular">
                                {purchase.purchased_on.slice(8, 10)}
                              </span>
                              <span className="text-xs font-semibold text-ink-2">
                                {formatDateShort(purchase.purchased_on).split(' ')[1]}
                              </span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-semibold">{purchase.name}</p>
                              <p className="truncate text-sm text-ink-2">
                                {purchase.store_id ? storeName.get(purchase.store_id) ?? 'Estabelecimento' : 'Sem estabelecimento'}
                                {', '}
                                {purchase.purchased_count} {purchase.purchased_count === 1 ? 'item' : 'itens'}
                              </p>
                              {comparison && comparison.percent && (
                                <p
                                  className={cn(
                                    'text-sm font-semibold tabular',
                                    comparison.difference.gt(0) ? 'text-alert' : 'text-leaf',
                                  )}
                                >
                                  {comparison.difference.gt(0) ? '+' : '−'}
                                  {formatMoney(comparison.difference.abs())} ({comparison.difference.gt(0) ? '+' : '−'}
                                  {formatPercent(comparison.percent.abs())}) vs. {formatDateShort(previous!.purchased_on)}
                                </p>
                              )}
                            </div>
                            <div className="shrink-0 text-right">
                              <span className="block font-tag text-xl font-semibold tabular">{formatMoney(amount.value)}</span>
                              <span className="text-xs text-ink-2">{amount.kind === 'paid' ? 'pago' : 'estimado'}</span>
                            </div>
                            <ChevronRight className="size-5 shrink-0 text-ink-3" aria-hidden />
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )
            })}
          </div>
        )}
      </PageBody>
    </>
  )
}
