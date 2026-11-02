import { Calculator, ListPlus, MoreVertical, Pencil, Tag, Trash2, TrendingDown, TrendingUp } from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { PageBody, PageHeader } from '@/app/AppLayout'
import { Button, IconButton } from '@/components/ui/Button'
import { useConfirm } from '@/components/ui/Confirm'
import { cn } from '@/components/ui/cn'
import { PriceTag } from '@/components/ui/PriceTag'
import { ActionSheet } from '@/components/ui/Sheet'
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { formatDate, formatMoney, formatNumberInput, formatPercent } from '@/lib/format'
import { errorMessage } from '@/lib/errors'
import { formatAmount } from '@/lib/units'
import { useUser } from '@/modules/auth/AuthProvider'
import { calculatorLinkFromItem } from '@/modules/calculator/links'
import { useFamily } from '@/modules/family/FamilyProvider'
import { getCategory } from '@/modules/shopping/categories'
import { describeQuantity } from '@/modules/shopping/domain/totals'
import { useStores } from '@/modules/shopping/hooks'
import { AddToListSheet, PriceRecordSheet, ProductFormSheet } from '../components/CatalogSheets'
import { PriceChart } from '../components/PriceChart'
import { canCompareStores, formatNormalized, refUnitLabel, summarizeRecords } from '../domain/priceStats'
import { useCatalogMutations, usePriceRecords, useProduct, useProductStats } from '../hooks'
import type { PriceRecord, Product } from '../types'

export function ProductDetailPage() {
  const { productId } = useParams()
  const product = useProduct(productId)
  if (product.isPending) {
    return (
      <>
        <PageHeader title="Produto" back="/produtos" />
        <LoadingBlock />
      </>
    )
  }
  if (!product.data) {
    return (
      <>
        <PageHeader title="Produto" back="/produtos" />
        <PageBody>
          {product.isError ? (
            <ErrorState message={errorMessage(product.error)} onRetry={() => void product.refetch()} />
          ) : (
            <EmptyState title="Produto não encontrado">Ele pode ter sido excluído do catálogo.</EmptyState>
          )}
        </PageBody>
      </>
    )
  }
  return <ProductDetail product={product.data} />
}

function ProductDetail({ product }: { product: Product }) {
  const user = useUser()
  const { isAdmin, nameOf } = useFamily()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const toast = useToast()
  const records = usePriceRecords(product.id)
  const stats = useProductStats()
  const stores = useStores()
  const { remove, removePrice } = useCatalogMutations()
  const [sheet, setSheet] = useState<'edit' | 'price' | 'list' | null>(null)
  const [menu, setMenu] = useState(false)

  const productStats = stats.byProduct.get(product.id)
  const summary = useMemo(() => summarizeRecords(records.data ?? []), [records.data])
  const storeName = (id: string | null) => (id ? stores.data?.find((s) => s.id === id)?.name ?? 'Estabelecimento' : null)
  const canDeleteProduct = isAdmin || product.created_by === user.id
  const last = summary.last

  async function deleteProduct() {
    const ok = await confirm({
      title: `Excluir ${product.name} do catálogo?`,
      message: 'O histórico de preços deste produto também será apagado. Itens em listas continuam, sem o vínculo.',
      confirmLabel: 'Excluir produto',
      tone: 'danger',
    })
    if (!ok) return
    remove.mutate(product.id, {
      onSuccess: () => {
        toast.success('Produto excluído.')
        navigate('/produtos', { replace: true })
      },
    })
  }

  async function deleteRecord(record: PriceRecord) {
    const ok = await confirm({
      title: 'Excluir este registro de preço?',
      message: `${formatMoney(record.price)} em ${formatDate(record.recorded_on)}. Use só para corrigir um registro errado.`,
      confirmLabel: 'Excluir registro',
      tone: 'danger',
    })
    if (ok) removePrice.mutate({ recordId: record.id, productId: product.id })
  }

  const category = getCategory(product.category)

  return (
    <>
      <PageHeader
        title={product.name}
        subtitle={[product.brand, `${category.emoji} ${category.label}`].filter(Boolean).join(' — ')}
        back="/produtos"
        actions={
          <IconButton label="Opções do produto" onClick={() => setMenu(true)}>
            <MoreVertical className="size-6" />
          </IconButton>
        }
      />
      <PageBody className="space-y-6">
        <section className="rounded-[var(--radius-panel)] bg-card p-4 ring-1 ring-line">
          {last ? (
            <>
              <div className="flex flex-wrap items-end gap-4">
                <PriceTag
                  value={last.price}
                  label="Último preço pago"
                  caption={describeRecordPackage(last)}
                  size="lg"
                />
                <div className="text-[0.9375rem]">
                  <p className="font-tag text-2xl font-semibold tabular">{formatNormalized(last.normalized_price, last.ref_unit)}</p>
                  <p className="text-ink-2">
                    {formatDate(last.recorded_on)}
                    {storeName(last.store_id) ? `, ${storeName(last.store_id)}` : ''}
                  </p>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-[0.9375rem] sm:grid-cols-4">
                <Indicator
                  label="Variação"
                  value={
                    summary.variation !== null ? (
                      <span
                        className={cn(
                          'inline-flex items-center gap-1',
                          summary.trend === 'up' && 'text-alert',
                          summary.trend === 'down' && 'text-leaf',
                        )}
                      >
                        {summary.trend === 'up' && <TrendingUp className="size-4" aria-hidden />}
                        {summary.trend === 'down' && <TrendingDown className="size-4" aria-hidden />}
                        {summary.variation.gt(0) ? '+' : summary.variation.lt(0) ? '−' : ''}
                        {formatPercent(summary.variation.abs())}
                      </span>
                    ) : (
                      '—'
                    )
                  }
                  hint={summary.previous ? `desde ${formatDate(summary.previous.recorded_on)}` : 'precisa de 2 registros'}
                />
                <Indicator
                  label="Menor registrado"
                  value={summary.lowest ? formatNormalized(summary.lowest.normalized_price, summary.lowest.ref_unit) : '—'}
                  hint={summary.lowest ? formatDate(summary.lowest.recorded_on) : undefined}
                />
                <Indicator
                  label="Maior registrado"
                  value={summary.highest ? formatNormalized(summary.highest.normalized_price, summary.highest.ref_unit) : '—'}
                  hint={summary.highest ? formatDate(summary.highest.recorded_on) : undefined}
                />
                <Indicator label="Registros" value={String(summary.count)} />
              </dl>
              {summary.count < 3 && (
                <p className="mt-3 text-sm text-ink-2">
                  Com poucos registros, use os números como referência. Cada compra finalizada adiciona um preço.
                </p>
              )}
            </>
          ) : (
            <EmptyState title="Nenhum preço registrado">
              Registre o preço quando vir na prateleira, ou finalize uma compra com este produto.
            </EmptyState>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button icon={<Tag className="size-5" />} onClick={() => setSheet('price')}>
              Registrar preço
            </Button>
            <Button variant="secondary" icon={<ListPlus className="size-5" />} onClick={() => setSheet('list')}>
              Adicionar a uma lista
            </Button>
            <Button
              variant="secondary"
              icon={<Calculator className="size-5" />}
              onClick={() =>
                navigate(
                  calculatorLinkFromItem({
                    name: product.name,
                    brand: product.brand,
                    unitPrice: last && last.price_basis === 'package' ? formatNumberInput(last.price, 2) : null,
                    quantity: last ? formatNumberInput(last.quantity) : formatNumberInput(product.package_size),
                    unit: last?.unit ?? product.unit,
                    productId: product.id,
                  }),
                )
              }
            >
              Comparar embalagens
            </Button>
          </div>
        </section>

        {last && <PriceChart records={records.data ?? []} refUnit={last.ref_unit} storeName={storeName} />}

        {summary.byStore.length > 0 && (
          <section aria-labelledby="stores-title">
            <h2 id="stores-title" className="text-lg font-bold">
              Último preço em cada lugar
            </h2>
            <ul className="mt-3 ruled overflow-hidden rounded-[var(--radius-panel)] bg-card px-4 ring-1 ring-line">
              {summary.byStore.map((s) => (
                <li key={s.storeId ?? 'none'} className="flex items-center justify-between gap-3 py-3">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{storeName(s.storeId) ?? 'Sem estabelecimento'}</span>
                    <span className="text-sm text-ink-2">
                      {formatDate(s.last.recorded_on)}, {s.count} {s.count === 1 ? 'registro' : 'registros'}
                    </span>
                  </span>
                  <span className="shrink-0 font-tag text-lg font-semibold tabular">
                    {formatNormalized(s.last.normalized_price, s.last.ref_unit)}
                  </span>
                </li>
              ))}
            </ul>
            {!canCompareStores(summary) && summary.byStore.length > 1 && (
              <p className="mt-2 text-sm text-ink-2">
                Ainda há poucos registros por estabelecimento para dizer qual costuma ser mais barato. Os valores acima são só
                os últimos preços anotados, em datas diferentes.
              </p>
            )}
          </section>
        )}

        <section aria-labelledby="history-title">
          <h2 id="history-title" className="text-lg font-bold">
            Histórico de preços
          </h2>
          {records.isPending ? (
            <LoadingBlock />
          ) : (records.data ?? []).length === 0 ? (
            <p className="mt-2 text-ink-2">Ainda não há registros.</p>
          ) : (
            <table className="mt-3 w-full overflow-hidden rounded-[var(--radius-panel)] bg-card text-left text-[0.9375rem] ring-1 ring-line">
              <caption className="sr-only">Todos os preços registrados de {product.name}</caption>
              <thead className="text-sm text-ink-2">
                <tr className="border-b border-line">
                  <th scope="col" className="px-4 py-2.5 font-semibold">Data</th>
                  <th scope="col" className="px-2 py-2.5 font-semibold">Preço</th>
                  <th scope="col" className="hidden px-2 py-2.5 font-semibold sm:table-cell">Onde</th>
                  <th scope="col" className="px-2 py-2.5 font-semibold">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {(records.data ?? []).map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0 align-top">
                    <td className="px-4 py-3">
                      <span className="block tabular">{formatDate(r.recorded_on)}</span>
                      <span className="text-sm text-ink-2">{r.source === 'purchase' ? 'compra' : `por ${nameOf(r.created_by, { you: 'lower' })}`}</span>
                    </td>
                    <td className="px-2 py-3">
                      <span className="block font-semibold tabular">{formatMoney(r.price)}</span>
                      <span className="text-sm text-ink-2 tabular">
                        {describeRecordPackage(r)}, {formatNormalized(r.normalized_price, r.ref_unit)}
                      </span>
                      <span className="block text-sm text-ink-2 sm:hidden">{storeName(r.store_id) ?? ''}</span>
                      {r.notes && <span className="block text-sm text-ink-2">{r.notes}</span>}
                    </td>
                    <td className="hidden px-2 py-3 sm:table-cell">{storeName(r.store_id) ?? '—'}</td>
                    <td className="px-2 py-2 text-right">
                      {(isAdmin || r.created_by === user.id) && (
                        <IconButton label="Excluir registro" tone="danger" onClick={() => void deleteRecord(r)}>
                          <Trash2 className="size-4" />
                        </IconButton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="text-[0.9375rem] text-ink-2">
          <p>
            Embalagem habitual:{' '}
            {product.package_size !== null ? formatAmount(product.package_size, product.unit) : `por ${product.unit === 'un' ? 'unidade' : product.unit}`}
          </p>
          {product.notes && <p className="mt-1">{product.notes}</p>}
          <p className="mt-1 text-sm text-ink-3">Atualizado em {formatDate(product.updated_at)} por {nameOf(product.updated_by, { you: 'lower' })}.</p>
        </section>
      </PageBody>

      <ActionSheet
        open={menu}
        onClose={() => setMenu(false)}
        title={product.name}
        actions={[
          { label: 'Editar produto', icon: <Pencil className="size-5" />, onSelect: () => setSheet('edit') },
          {
            label: 'Excluir do catálogo',
            description: canDeleteProduct ? 'Apaga também o histórico de preços' : 'Só quem cadastrou ou um administrador',
            icon: <Trash2 className="size-5" />,
            tone: 'danger',
            disabled: !canDeleteProduct,
            onSelect: () => void deleteProduct(),
          },
        ]}
      />
      <ProductFormSheet open={sheet === 'edit'} onClose={() => setSheet(null)} product={product} />
      <PriceRecordSheet open={sheet === 'price'} onClose={() => setSheet(null)} product={product} stats={productStats} />
      <AddToListSheet open={sheet === 'list'} onClose={() => setSheet(null)} product={product} stats={productStats} />
    </>
  )
}

function describeRecordPackage(record: PriceRecord): string {
  if (record.price_basis === 'measure') return `por ${refUnitLabel(record.ref_unit)}`
  return `por ${describeQuantity({ packages: 1, quantity: record.quantity, unit: record.unit })}`
}

function Indicator({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-[var(--radius-field)] bg-paper px-3 py-2.5">
      <dt className="text-sm text-ink-2">{label}</dt>
      <dd className="font-semibold tabular">{value}</dd>
      {hint && <dd className="text-xs text-ink-3">{hint}</dd>}
    </div>
  )
}
