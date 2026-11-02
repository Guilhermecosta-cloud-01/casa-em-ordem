import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, ListChecks, Pencil, Trash2, TrendingDown, TrendingUp } from 'lucide-react'
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { PageBody, PageHeader } from '@/app/AppLayout'
import { Button, ButtonLink } from '@/components/ui/Button'
import { useConfirm } from '@/components/ui/Confirm'
import { cn } from '@/components/ui/cn'
import { MoneyField, SelectField, TextArea, TextField } from '@/components/ui/Field'
import { PriceTag } from '@/components/ui/PriceTag'
import { Sheet } from '@/components/ui/Sheet'
import { EmptyState, ErrorState, LoadingBlock, Notice } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { numberErrorMessage, parseBrNumber, toBig, toBigOrNull } from '@/lib/decimal'
import { errorMessage } from '@/lib/errors'
import { formatDate, formatMoney, formatMoneyInput, formatPercent, todayIso } from '@/lib/format'
import { normalizeText } from '@/lib/text'
import { useUser } from '@/modules/auth/AuthProvider'
import { useFamily } from '@/modules/family/FamilyProvider'
import * as api from '../api'
import { getCategory } from '../categories'
import { compareAmounts, normalizedUnitPrice, previousSameName, purchaseAmount } from '../domain/history'
import { describeQuantity } from '../domain/totals'
import { useListMutations, usePurchases, useStores } from '../hooks'
import type { Purchase, PurchaseItem } from '../types'

export function PurchaseDetailPage() {
  const { purchaseId } = useParams()
  const purchase = useQuery({
    queryKey: ['purchase', purchaseId],
    queryFn: () => api.fetchPurchase(purchaseId!),
    enabled: Boolean(purchaseId),
  })
  if (purchase.isPending) {
    return (
      <>
        <PageHeader title="Compra" back="/historico" />
        <LoadingBlock />
      </>
    )
  }
  if (!purchase.data) {
    return (
      <>
        <PageHeader title="Compra" back="/historico" />
        <PageBody>
          {purchase.isError ? (
            <ErrorState message={errorMessage(purchase.error)} onRetry={() => void purchase.refetch()} />
          ) : (
            <EmptyState title="Compra não encontrada">Ela pode ter sido excluída.</EmptyState>
          )}
        </PageBody>
      </>
    )
  }
  return <PurchaseDetail purchase={purchase.data} />
}

function PurchaseDetail({ purchase }: { purchase: Purchase }) {
  const user = useUser()
  const { isAdmin, nameOf } = useFamily()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const stores = useStores()
  const purchases = usePurchases()
  const { duplicate } = useListMutations()
  const [editing, setEditing] = useState(false)

  const items = useQuery({ queryKey: ['purchase-items', purchase.id], queryFn: () => api.fetchPurchaseItems(purchase.id) })
  const previous = useMemo(
    () => (purchases.data ? previousSameName(purchases.data, purchase) : null),
    [purchases.data, purchase],
  )
  const previousItems = useQuery({
    queryKey: ['purchase-items', previous?.id],
    queryFn: () => api.fetchPurchaseItems(previous!.id),
    enabled: Boolean(previous),
  })

  const amount = purchaseAmount(purchase)
  const estimated = toBig(purchase.estimated_total)
  const paid = toBigOrNull(purchase.paid_total)
  const comparison = previous ? compareAmounts(purchase, previous) : null
  const storeName = purchase.store_id ? stores.data?.find((s) => s.id === purchase.store_id)?.name : null
  const canDelete = isAdmin || purchase.created_by === user.id

  const previousByKey = useMemo(() => {
    const map = new Map<string, PurchaseItem>()
    for (const item of previousItems.data ?? []) {
      map.set(item.product_id ?? `name:${normalizeText(item.name)}`, item)
      map.set(`name:${normalizeText(item.name)}`, item)
    }
    return map
  }, [previousItems.data])

  async function remove() {
    const ok = await confirm({
      title: 'Excluir esta compra do histórico?',
      message: 'Os preços registrados por ela também saem do histórico dos produtos. A lista não é afetada.',
      confirmLabel: 'Excluir compra',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await api.deletePurchase(purchase.id)
      void queryClient.invalidateQueries({ queryKey: ['purchases'] })
      void queryClient.invalidateQueries({ queryKey: ['product-stats'] })
      void queryClient.invalidateQueries({ queryKey: ['list-purchase'] })
      toast.success('Compra excluída do histórico.')
      navigate('/historico', { replace: true })
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <>
      <PageHeader
        title={purchase.name}
        subtitle={[formatDate(purchase.purchased_on), storeName].filter(Boolean).join(' — ')}
        back="/historico"
      />
      <PageBody className="space-y-6">
        <section className="rounded-[var(--radius-panel)] bg-card p-4 ring-1 ring-line">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <PriceTag value={amount.value} label={amount.kind === 'paid' ? 'Valor pago' : 'Total estimado'} size="lg" />
            <Button variant="secondary" size="sm" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
              Editar
            </Button>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[0.9375rem]">
            <div>
              <dt className="text-ink-2">Estimado dos itens comprados</dt>
              <dd className="font-tag text-xl font-semibold tabular">{formatMoney(estimated)}</dd>
            </div>
            <div>
              <dt className="text-ink-2">Itens comprados</dt>
              <dd className="font-tag text-xl font-semibold tabular">
                {purchase.purchased_count} de {purchase.items_count}
              </dd>
            </div>
            {paid && (
              <div className="col-span-2">
                <dt className="text-ink-2">Diferença entre pago e estimado</dt>
                <dd className={cn('font-semibold tabular', paid.gt(estimated) ? 'text-alert' : 'text-leaf')}>
                  {paid.eq(estimated)
                    ? 'Nenhuma: o estimado bateu com o cupom'
                    : `${formatMoney(paid.minus(estimated).abs())} ${paid.gt(estimated) ? 'acima' : 'abaixo'} do estimado`}
                </dd>
              </div>
            )}
          </dl>
          {comparison && previous && (
            <Notice className="mt-4" tone={comparison.difference.gt(0) ? 'warn' : 'success'}>
              Comparando com a compra "{previous.name}" de {formatDate(previous.purchased_on)}:{' '}
              <strong className="tabular">
                {comparison.difference.eq(0)
                  ? 'mesmo valor'
                  : `${comparison.difference.gt(0) ? '+' : '−'}${formatMoney(comparison.difference.abs())}${
                      comparison.percent ? ` (${comparison.difference.gt(0) ? '+' : '−'}${formatPercent(comparison.percent.abs())})` : ''
                    }`}
              </strong>{' '}
              ({comparison.kind === 'paid' ? 'valores pagos' : 'valores estimados'}).
            </Notice>
          )}
          {purchase.notes && <p className="mt-4 text-ink-2">{purchase.notes}</p>}
          <p className="mt-3 text-sm text-ink-3">Registrada por {nameOf(purchase.created_by)}.</p>
        </section>

        <section aria-labelledby="items-title">
          <h2 id="items-title" className="text-lg font-bold">
            Itens comprados
          </h2>
          {items.isPending ? (
            <LoadingBlock />
          ) : (
            <ul className="mt-3 ruled overflow-hidden rounded-[var(--radius-panel)] bg-card px-4 ring-1 ring-line">
              {(items.data ?? []).map((item) => {
                const before = previousByKey.get(item.product_id ?? '') ?? previousByKey.get(`name:${normalizeText(item.name)}`)
                const now = normalizedUnitPrice(item)
                const then = before ? normalizedUnitPrice(before) : null
                const change =
                  now && then && now.refUnit === then.refUnit && !then.value.eq(0)
                    ? now.value.minus(then.value).div(then.value).times(100)
                    : null
                return (
                  <li key={item.id} className="flex items-start gap-3 py-3">
                    <span aria-hidden className="pt-0.5">
                      {getCategory(item.category).emoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">
                        {item.name} {item.brand && <span className="font-normal text-ink-2">{item.brand}</span>}
                      </p>
                      <p className="text-sm text-ink-2 tabular">
                        {describeQuantity(item)}
                        {item.unit_price !== null && `, ${formatMoney(item.unit_price)} ${item.price_basis === 'measure' ? 'por medida' : 'cada'}`}
                      </p>
                      {change && change.abs().gte(0.5) && (
                        <p className={cn('flex items-center gap-1 text-sm font-semibold tabular', change.gt(0) ? 'text-alert' : 'text-leaf')}>
                          {change.gt(0) ? <TrendingUp className="size-4" aria-hidden /> : <TrendingDown className="size-4" aria-hidden />}
                          {change.gt(0) ? '+' : '−'}
                          {formatPercent(change.abs())} desde a compra anterior
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 font-tag text-lg font-semibold tabular">
                      {item.line_total !== null ? formatMoney(item.line_total) : '—'}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <div className="flex flex-wrap gap-2">
          {purchase.list_id && (
            <>
              <ButtonLink to={`/listas/${purchase.list_id}`} variant="secondary" icon={<ListChecks className="size-5" />}>
                Abrir a lista
              </ButtonLink>
              <Button
                variant="secondary"
                icon={<Copy className="size-5" />}
                loading={duplicate.isPending}
                onClick={() =>
                  duplicate.mutate(
                    { listId: purchase.list_id!, name: purchase.name },
                    {
                      onSuccess: (newId) => {
                        toast.success('Nova lista criada com os mesmos itens.')
                        navigate(`/listas/${newId}`)
                      },
                    },
                  )
                }
              >
                Repetir esta compra
              </Button>
            </>
          )}
          {canDelete && (
            <Button variant="quiet-danger" icon={<Trash2 className="size-5" />} onClick={() => void remove()}>
              Excluir do histórico
            </Button>
          )}
        </div>
      </PageBody>
      <EditPurchaseSheet open={editing} onClose={() => setEditing(false)} purchase={purchase} />
    </>
  )
}

function EditPurchaseSheet({ open, onClose, purchase }: { open: boolean; onClose: () => void; purchase: Purchase }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const stores = useStores()
  const [date, setDate] = useState(purchase.purchased_on)
  const [paid, setPaid] = useState('')
  const [storeId, setStoreId] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setDate(purchase.purchased_on)
    setPaid(formatMoneyInput(purchase.paid_total))
    setStoreId(purchase.store_id ?? '')
    setNotes(purchase.notes ?? '')
    setError(null)
  }, [open, purchase])

  async function save(event: FormEvent) {
    event.preventDefault()
    let paidValue: string | null = null
    if (paid.trim()) {
      const parsed = parseBrNumber(paid, { maxDecimals: 2 })
      if (!parsed.ok) {
        setError(numberErrorMessage(parsed.error))
        return
      }
      paidValue = parsed.value.toString()
    }
    if (!date || date > todayIso()) {
      setError('Informe uma data até hoje.')
      return
    }
    setBusy(true)
    try {
      await api.updatePurchase(purchase.id, {
        purchased_on: date,
        paid_total: paidValue,
        store_id: storeId || null,
        notes: notes.trim() || null,
      })
      await queryClient.invalidateQueries({ queryKey: ['purchase', purchase.id] })
      void queryClient.invalidateQueries({ queryKey: ['purchases'] })
      void queryClient.invalidateQueries({ queryKey: ['list-purchase'] })
      toast.success('Compra atualizada.')
      onClose()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Editar compra"
      footer={
        <Button type="submit" form="purchase-form" size="lg" block loading={busy}>
          Salvar
        </Button>
      }
    >
      <form id="purchase-form" onSubmit={save} className="space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Data" type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
          <MoneyField label="Valor pago" value={paid} onChange={(e) => setPaid(e.target.value)} />
        </div>
        <SelectField label="Estabelecimento" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
          <option value="">Não informado</option>
          {(stores.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </SelectField>
        <TextArea label="Observações" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={500} />
        {error && (
          <Notice tone="danger">
            <span role="alert">{error}</span>
          </Notice>
        )}
      </form>
    </Sheet>
  )
}
