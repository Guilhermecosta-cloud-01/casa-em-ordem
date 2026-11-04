import { ListPlus, MoreVertical, Plus, Search } from 'lucide-react'
import { type FormEvent, useMemo, useState } from 'react'
import { PageBody, PageHeader } from '@/app/AppLayout'
import { Button, IconButton } from '@/components/ui/Button'
import { PendingMark } from '@/components/ui/CheckCircle'
import { useConfirm } from '@/components/ui/Confirm'
import { Badge, Segmented, Stepper } from '@/components/ui/Controls'
import { DecimalField, SelectField, TextArea, TextField } from '@/components/ui/Field'
import { ActionSheet, Sheet } from '@/components/ui/Sheet'
import { EmptyState, ErrorState, LoadingBlock, Notice } from '@/components/ui/States'
import { cn } from '@/components/ui/cn'
import { numberErrorMessage, parseBrNumber, toBig } from '@/lib/decimal'
import { errorMessage } from '@/lib/errors'
import { formatNumberInput } from '@/lib/format'
import { matchesSearch, normalizeText } from '@/lib/text'
import { type Unit, UNIT_INFO, UNITS } from '@/lib/units'
import { useProducts } from '@/modules/catalog/hooks'
import { allCategories, getCategory, guessCategory } from '@/modules/shopping/categories'
import { type ItemToSend, SendToListSheet } from '@/modules/shopping/components/SendToListSheet'
import { groupByLocation, LOCATIONS, quantityLabel, stepFor, stockStatus, suggestedPackages } from './domain'
import { useStock, useStockActions } from './hooks'
import type { StockFields, StockItem } from './types'

export function StockPage() {
  const { items, pendingIds, isLoading, error, refetch } = useStock()
  const actions = useStockActions()
  const [view, setView] = useState<'all' | 'low'>('all')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<StockItem | 'new' | null>(null)
  const [menu, setMenu] = useState<StockItem | null>(null)
  const [sending, setSending] = useState<ItemToSend[] | null>(null)
  const confirm = useConfirm()

  const low = useMemo(() => (items ?? []).filter((i) => stockStatus(i) !== 'ok'), [items])
  const visible = useMemo(() => {
    const base = view === 'low' ? low : items ?? []
    return search.trim() ? base.filter((i) => matchesSearch(`${i.name} ${i.location ?? ''}`, search)) : base
  }, [items, low, view, search])

  const toSend = (item: StockItem): ItemToSend => ({
    name: item.name,
    category: item.category,
    product_id: item.product_id,
    packages: suggestedPackages(item),
  })

  return (
    <>
      <PageHeader
        title="Estoque"
        subtitle="O que tem em casa"
        actions={
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            Novo
          </Button>
        }
      />
      <PageBody className="space-y-5">
        {low.length > 0 && (
          <Notice tone="warn">
            <div className="flex flex-wrap items-center gap-3">
              <p className="min-w-0 flex-1">
                <strong>{low.length === 1 ? '1 item acabando' : `${low.length} itens acabando`}</strong>:{' '}
                {low
                  .slice(0, 4)
                  .map((i) => i.name)
                  .join(', ')}
                {low.length > 4 ? '…' : ''}
              </p>
              <Button size="sm" variant="secondary" icon={<ListPlus className="size-4" />} onClick={() => setSending(low.map(toSend))}>
                Pôr todos na lista
              </Button>
            </div>
          </Notice>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            label="Mostrar"
            value={view}
            onChange={setView}
            options={[
              { value: 'all', label: 'Tudo', count: items?.length },
              { value: 'low', label: 'Acabando', count: low.length },
            ]}
          />
          <TextField
            label="Buscar no estoque"
            labelHidden
            placeholder="Buscar"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            prefix={<Search className="size-4" />}
            containerClassName="min-w-48 flex-1"
          />
        </div>

        {isLoading && !items ? (
          <LoadingBlock />
        ) : error && !items ? (
          <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
        ) : visible.length === 0 ? (
          <EmptyState
            title={items?.length ? 'Nada por aqui' : 'Estoque vazio'}
            action={
              !items?.length && (
                <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
                  Cadastrar o primeiro item
                </Button>
              )
            }
          >
            {items?.length
              ? view === 'low'
                ? 'Nenhum item abaixo do mínimo.'
                : 'Nenhum item com esse nome.'
              : 'Cadastre o que costuma ter em casa e o estoque mínimo de cada item. Quando chegar no mínimo, o app avisa.'}
          </EmptyState>
        ) : (
          groupByLocation(visible).map((group) => (
            <section key={group.location} aria-labelledby={`local-${normalizeText(group.location)}`}>
              <h2 id={`local-${normalizeText(group.location)}`} className="mb-2 text-sm font-bold text-ink-2">
                {group.location}
              </h2>
              <ul className="divide-y divide-line rounded-[var(--radius-panel)] bg-card px-3 ring-1 ring-line">
                {group.items.map((item) => (
                  <StockRow
                    key={item.id}
                    item={item}
                    pending={pendingIds.has(item.id)}
                    onAdjust={(delta) => actions.adjust(item, delta)}
                    onOpen={() => setEditing(item)}
                    onMenu={() => setMenu(item)}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </PageBody>

      <StockSheet
        key={editing === 'new' ? 'new' : editing?.id ?? 'none'}
        open={editing !== null}
        item={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
      />
      <ActionSheet
        open={menu !== null}
        onClose={() => setMenu(null)}
        title={menu?.name ?? ''}
        actions={
          menu
            ? [
                { label: 'Pôr na lista de compras', icon: <ListPlus className="size-5" />, onSelect: () => setSending([toSend(menu)]) },
                { label: 'Editar', onSelect: () => setEditing(menu) },
                {
                  label: 'Excluir do estoque',
                  tone: 'danger',
                  onSelect: async () => {
                    const ok = await confirm({ title: `Excluir ${menu.name} do estoque?`, confirmLabel: 'Excluir', tone: 'danger' })
                    if (ok) actions.remove(menu)
                  },
                },
              ]
            : []
        }
      />
      <SendToListSheet open={sending !== null} onClose={() => setSending(null)} items={sending ?? []} />
    </>
  )
}

function StockRow({
  item,
  pending,
  onAdjust,
  onOpen,
  onMenu,
}: {
  item: StockItem
  pending: boolean
  onAdjust: (delta: number) => void
  onOpen: () => void
  onMenu: () => void
}) {
  const status = stockStatus(item)
  const step = stepFor(item.unit)
  return (
    <li className="flex items-center gap-2 py-3">
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className="flex items-center gap-2">
          <span aria-hidden>{getCategory(item.category).emoji}</span>
          <span className="truncate font-semibold">{item.name}</span>
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
          <span className={cn('font-semibold tabular', status !== 'ok' && 'text-alert')}>{quantityLabel(item)}</span>
          {item.min_quantity !== null && <span>mín. {quantityLabel({ quantity: item.min_quantity, unit: item.unit })}</span>}
          {status === 'out' && <Badge tone="alert">Acabou</Badge>}
          {status === 'low' && <Badge tone="amber">Acabando</Badge>}
          <PendingMark pending={pending} />
        </span>
      </button>
      <Stepper
        size="sm"
        label={`Quantidade de ${item.name}`}
        value={<span className="sr-only">{quantityLabel(item)}</span>}
        canDecrement={toBig(item.quantity).gt(0)}
        onDecrement={() => onAdjust(-step)}
        onIncrement={() => onAdjust(step)}
      />
      <IconButton label={`Mais ações para ${item.name}`} onClick={onMenu}>
        <MoreVertical className="size-5" />
      </IconButton>
    </li>
  )
}

const QUANTITY = { maxDecimals: 3, allowZero: true, max: 999999 }

function StockSheet({ open, item, onClose }: { open: boolean; item: StockItem | null; onClose: () => void }) {
  const actions = useStockActions()
  const products = useProducts()
  const [name, setName] = useState(item?.name ?? '')
  const [category, setCategory] = useState(item?.category ?? '')
  const [unit, setUnit] = useState<Unit>(item?.unit ?? 'un')
  const [quantity, setQuantity] = useState(item ? formatNumberInput(item.quantity) : '')
  const [min, setMin] = useState(item?.min_quantity !== null && item ? formatNumberInput(item.min_quantity) : '')
  const [location, setLocation] = useState(item?.location ?? '')
  const [notes, setNotes] = useState(item?.notes ?? '')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsedQuantity = parseBrNumber(quantity || '0', QUANTITY)
  const parsedMin = min.trim() ? parseBrNumber(min, QUANTITY) : null
  const errors = {
    name: !name.trim() ? 'Dê um nome ao item.' : null,
    quantity: parsedQuantity.ok ? null : numberErrorMessage(parsedQuantity.error),
    min: parsedMin && !parsedMin.ok ? numberErrorMessage(parsedMin.error) : null,
  }

  function save(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (errors.name || errors.quantity || errors.min || !parsedQuantity.ok) return
    const trimmed = name.trim().slice(0, 120)
    const product = (products.data ?? []).find((p) => normalizeText(p.name) === normalizeText(trimmed))
    const fields: StockFields = {
      product_id: item?.product_id ?? product?.id ?? null,
      name: trimmed,
      category: category || product?.category || guessCategory(trimmed),
      unit,
      quantity: parsedQuantity.value.toString(),
      min_quantity: parsedMin && parsedMin.ok ? parsedMin.value.toString() : null,
      location: location.trim() || null,
      notes: notes.trim() || null,
    }
    try {
      if (item) {
        const patch: Partial<StockFields> = {}
        for (const key of Object.keys(fields) as (keyof StockFields)[]) {
          const before = item[key] === null ? null : String(item[key])
          const after = fields[key] === null ? null : String(fields[key])
          const changed =
            key === 'quantity' || key === 'min_quantity'
              ? (before === null) !== (after === null) || (before !== null && after !== null && !toBig(before).eq(toBig(after)))
              : before !== after
          if (changed) (patch as Record<string, unknown>)[key] = fields[key]
        }
        if (Object.keys(patch).length > 0) actions.update(item, patch)
      } else {
        actions.create(fields)
      }
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={item ? 'Editar item do estoque' : 'Novo item no estoque'}
      footer={
        <Button type="submit" form="stock-form" size="lg" block>
          {item ? 'Salvar' : 'Cadastrar'}
        </Button>
      }
    >
      <form id="stock-form" onSubmit={save} className="space-y-4" noValidate>
        {error && <Notice tone="danger">{error}</Notice>}
        <TextField
          label="Item"
          value={name}
          maxLength={120}
          list="stock-products"
          onChange={(e) => setName(e.target.value)}
          error={submitted ? errors.name : null}
          autoFocus={!item}
        />
        <datalist id="stock-products">
          {(products.data ?? []).map((p) => (
            <option key={p.id} value={p.name} />
          ))}
        </datalist>
        <div className="grid grid-cols-2 gap-3">
          <DecimalField
            label="Quantidade em casa"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            error={submitted ? errors.quantity : null}
          />
          <SelectField label="Unidade" value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {UNIT_INFO[u].option}
              </option>
            ))}
          </SelectField>
        </div>
        <DecimalField
          label="Estoque mínimo"
          hint="Quando chegar nesse número, o app avisa a família. Deixe vazio para não avisar."
          value={min}
          onChange={(e) => setMin(e.target.value)}
          error={submitted ? errors.min : null}
        />
        <div>
          <TextField label="Onde fica" value={location} maxLength={40} list="stock-locations" onChange={(e) => setLocation(e.target.value)} />
          <datalist id="stock-locations">
            {LOCATIONS.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </div>
        <SelectField
          label="Categoria"
          value={category || (name.trim() ? guessCategory(name) : 'outros')}
          onChange={(e) => setCategory(e.target.value)}
        >
          {allCategories().map((c) => (
            <option key={c.id} value={c.id}>
              {c.emoji} {c.label}
            </option>
          ))}
        </SelectField>
        <TextArea label="Observações" value={notes} maxLength={500} rows={2} onChange={(e) => setNotes(e.target.value)} />
      </form>
    </Sheet>
  )
}
