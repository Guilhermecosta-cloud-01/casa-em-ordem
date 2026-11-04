import { type FormEvent, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/Controls'
import { DecimalField, MoneyField, SelectField, TextArea, TextField } from '@/components/ui/Field'
import { Sheet } from '@/components/ui/Sheet'
import { Notice } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { numberErrorMessage, parseBrNumber } from '@/lib/decimal'
import { errorMessage } from '@/lib/errors'
import { formatMoney, formatNumberInput, todayIso } from '@/lib/format'
import { newId } from '@/lib/id'
import { priceBasisLabel, UNIT_INFO, UNITS, type Unit } from '@/lib/units'
import { useActiveFamily } from '@/modules/family/FamilyProvider'
import { ensureStore } from '@/modules/shopping/api'
import { allCategories, guessCategory } from '@/modules/shopping/categories'
import { unitAcceptsContent } from '@/modules/shopping/domain/itemForm'
import { lineTotal } from '@/modules/shopping/domain/totals'
import { useLists, useStores } from '@/modules/shopping/hooks'
import { queueInsertItem } from '@/modules/shopping/offline'
import type { PriceBasis } from '@/modules/shopping/types'
import type { ProductInput } from '../api'
import { useCatalogMutations } from '../hooks'
import type { Product, ProductStats } from '../types'

const QTY = { maxDecimals: 3, allowZero: false, max: 999999 }
const MONEY = { maxDecimals: 2, max: 9999999 }

export function ProductFormSheet({
  open,
  onClose,
  product,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  product?: Product | null
  onSaved?: (product: Product) => void
}) {
  const { create, update } = useCatalogMutations()
  const [name, setName] = useState('')
  const [category, setCategory] = useState('outros')
  const [brand, setBrand] = useState('')
  const [unit, setUnit] = useState<Unit>('un')
  const [size, setSize] = useState('')
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    setName(product?.name ?? '')
    setCategory(product?.category ?? 'outros')
    setBrand(product?.brand ?? '')
    setUnit(product?.unit ?? 'un')
    setSize(formatNumberInput(product?.package_size ?? null))
    setNotes(product?.notes ?? '')
    setErrors({})
  }, [open, product])

  function submit(event: FormEvent) {
    event.preventDefault()
    const found: Record<string, string> = {}
    if (!name.trim()) found.name = 'Informe o nome do produto.'
    let sizeValue: string | null = null
    if (size.trim() && unitAcceptsContent(unit)) {
      const parsed = parseBrNumber(size, QTY)
      if (parsed.ok) sizeValue = parsed.value.toString()
      else found.size = parsed.error === 'zero' ? 'O tamanho não pode ser zero.' : numberErrorMessage(parsed.error, QTY)
    }
    setErrors(found)
    if (Object.keys(found).length > 0) return
    const input: ProductInput = {
      name: name.trim(),
      category,
      brand: brand.trim() || null,
      unit,
      package_size: sizeValue,
      notes: notes.trim() || null,
    }
    if (product) {
      update.mutate({ productId: product.id, patch: input }, { onSuccess: (p) => { onSaved?.(p); onClose() } })
    } else {
      create.mutate(input, { onSuccess: (p) => { onSaved?.(p); onClose() } })
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={product ? 'Editar produto' : 'Novo produto'}
      footer={
        <Button type="submit" form="product-form" size="lg" block loading={create.isPending || update.isPending}>
          {product ? 'Salvar' : 'Cadastrar produto'}
        </Button>
      }
    >
      <form id="product-form" onSubmit={submit} className="space-y-4" noValidate>
        <TextField
          label="Nome"
          value={name}
          onChange={(e) => {
            if (!product && (category === 'outros' || category === guessCategory(name))) setCategory(guessCategory(e.target.value))
            setName(e.target.value)
          }}
          error={errors.name}
          maxLength={120}
        />
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Categoria" value={category} onChange={(e) => setCategory(e.target.value)}>
            {allCategories().map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.label}
              </option>
            ))}
          </SelectField>
          <TextField label="Marca (opcional)" value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={80} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Unidade de referência" value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {UNIT_INFO[u].option}
              </option>
            ))}
          </SelectField>
          {unitAcceptsContent(unit) && (
            <DecimalField
              label="Embalagem habitual"
              value={size}
              onChange={(e) => setSize(e.target.value)}
              error={errors.size}
              suffix={UNIT_INFO[unit].short}
              placeholder="ex.: 5"
            />
          )}
        </div>
        <TextArea label="Observações (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={500} />
      </form>
    </Sheet>
  )
}

export function PriceRecordSheet({
  open,
  onClose,
  product,
  stats,
}: {
  open: boolean
  onClose: () => void
  product: Product
  stats: ProductStats | undefined
}) {
  const family = useActiveFamily()
  const stores = useStores()
  const { addPrice } = useCatalogMutations()
  const toast = useToast()
  const [price, setPrice] = useState('')
  const [unit, setUnit] = useState<Unit>(product.unit)
  const [quantity, setQuantity] = useState('')
  const [basis, setBasis] = useState<PriceBasis>('package')
  const [storeId, setStoreId] = useState('')
  const [newStore, setNewStore] = useState('')
  const [date, setDate] = useState(todayIso())
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setPrice('')
    setUnit(stats?.last_unit ?? product.unit)
    setQuantity(formatNumberInput(stats ? stats.last_quantity : product.package_size))
    setBasis(stats?.last_price_basis ?? 'package')
    // Não pré-seleciona o último estabelecimento: atribuir um preço ao lugar
    // errado distorceria as comparações.
    setStoreId('')
    setNewStore('')
    setDate(todayIso())
    setNotes('')
    setErrors({})
  }, [open, product, stats])

  const hasContent = unitAcceptsContent(unit) && quantity.trim() !== ''

  async function submit(event: FormEvent) {
    event.preventDefault()
    const found: Record<string, string> = {}
    const parsedPrice = parseBrNumber(price, MONEY)
    if (!parsedPrice.ok) found.price = numberErrorMessage(parsedPrice.error, MONEY)
    let quantityValue: string | null = null
    if (hasContent) {
      const parsed = parseBrNumber(quantity, QTY)
      if (parsed.ok) quantityValue = parsed.value.toString()
      else found.quantity = parsed.error === 'zero' ? 'O conteúdo não pode ser zero.' : numberErrorMessage(parsed.error, QTY)
    }
    if (!date || date > todayIso()) found.date = 'Informe uma data até hoje.'
    if (storeId === '__new' && !newStore.trim()) found.store = 'Informe o nome do estabelecimento.'
    setErrors(found)
    if (Object.keys(found).length > 0 || !parsedPrice.ok) return
    setBusy(true)
    try {
      let resolvedStore: string | null = storeId && storeId !== '__new' ? storeId : null
      if (storeId === '__new') resolvedStore = (await ensureStore(family.id, newStore)).id
      await addPrice.mutateAsync({
        productId: product.id,
        price: parsedPrice.value.toString(),
        priceBasis: hasContent ? basis : 'package',
        quantity: quantityValue,
        unit,
        storeId: resolvedStore,
        recordedOn: date,
        notes: notes.trim() || null,
      })
      void stores.refetch()
      toast.success('Preço registrado no histórico.')
      onClose()
    } catch (e) {
      setErrors({ form: errorMessage(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Registrar preço"
      description={`${product.name}${product.brand ? ` ${product.brand}` : ''}. O preço entra no histórico; nada é substituído.`}
      footer={
        <Button type="submit" form="price-form" size="lg" block loading={busy}>
          Registrar
        </Button>
      }
    >
      <form id="price-form" onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Unidade" value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {UNIT_INFO[u].option}
              </option>
            ))}
          </SelectField>
          {unitAcceptsContent(unit) && (
            <DecimalField
              label="Conteúdo da embalagem"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              error={errors.quantity}
              suffix={UNIT_INFO[unit].short}
              placeholder="opcional"
            />
          )}
        </div>
        <MoneyField
          label={hasContent ? 'Preço' : `Preço por ${unit === 'un' ? 'unidade' : UNIT_INFO[unit].singular}`}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          error={errors.price}
          autoFocus
        />
        {hasContent && (
          <Segmented
            label="O preço é"
            value={basis}
            onChange={setBasis}
            options={[
              { value: 'package', label: 'por embalagem' },
              { value: 'measure', label: priceBasisLabel('measure', unit) },
            ]}
          />
        )}
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Data" type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} error={errors.date} />
          <SelectField label="Onde" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            <option value="">Não informar</option>
            {(stores.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            <option value="__new">+ Novo estabelecimento</option>
          </SelectField>
        </div>
        {storeId === '__new' && (
          <TextField label="Nome do estabelecimento" value={newStore} onChange={(e) => setNewStore(e.target.value)} error={errors.store} maxLength={80} />
        )}
        <TextField label="Observação (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} placeholder="Ex.: promoção leve 3 pague 2" />
        {errors.form && (
          <Notice tone="danger">
            <span role="alert">{errors.form}</span>
          </Notice>
        )}
      </form>
    </Sheet>
  )
}

export function AddToListSheet({
  open,
  onClose,
  product,
  stats,
}: {
  open: boolean
  onClose: () => void
  product: Product
  stats: ProductStats | undefined
}) {
  const lists = useLists('active')
  const toast = useToast()
  const [listId, setListId] = useState('')
  const [packages, setPackages] = useState('1')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const featured = lists.data?.find((l) => l.is_featured) ?? lists.data?.[0]
    setListId(featured?.id ?? '')
    setPackages('1')
    setError(null)
  }, [open, lists.data])

  const parsed = parseBrNumber(packages, { maxDecimals: 3, allowZero: false, max: 9999 })
  const preview = parsed.ok
    ? lineTotal({
        packages: parsed.value.toString(),
        quantity: stats ? stats.last_quantity : product.package_size,
        unit: stats ? stats.last_unit : product.unit,
        unit_price: stats ? stats.last_price : null,
        price_basis: stats ? stats.last_price_basis : 'package',
      })
    : null

  function add() {
    const list = lists.data?.find((l) => l.id === listId)
    if (!list) {
      setError('Escolha uma lista.')
      return
    }
    if (!parsed.ok) {
      setError(numberErrorMessage(parsed.error))
      return
    }
    try {
      queueInsertItem({
        id: newId(),
        family_id: list.family_id,
        list_id: list.id,
        product_id: product.id,
        name: product.name,
        category: product.category,
        brand: product.brand,
        packages: parsed.value.toString(),
        quantity: stats ? stats.last_quantity : product.package_size,
        unit: stats ? stats.last_unit : product.unit,
        unit_price: stats ? stats.last_price : null,
        price_basis: stats ? stats.last_price_basis : 'package',
        notes: null,
        is_purchased: false,
      })
      toast.success(`${product.name} incluído em ${list.name}.`)
      onClose()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Adicionar a uma lista"
      description={stats ? `Com o último preço pago: ${formatMoney(stats.last_price)}.` : 'Sem preço registrado ainda.'}
      footer={
        <Button size="lg" block onClick={add} disabled={!lists.data?.length}>
          Adicionar
        </Button>
      }
    >
      {lists.data && lists.data.length === 0 ? (
        <Notice>Não há listas ativas. Crie uma lista primeiro.</Notice>
      ) : (
        <div className="space-y-4">
          <SelectField label="Lista" value={listId} onChange={(e) => setListId(e.target.value)}>
            {(lists.data ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
                {l.is_featured ? ' (em destaque)' : ''}
              </option>
            ))}
          </SelectField>
          <DecimalField label="Quantidade de embalagens" value={packages} onChange={(e) => setPackages(e.target.value)} />
          {preview && (
            <p className="rounded-[var(--radius-field)] bg-pen-soft px-4 py-3 font-semibold">
              Total estimado: <span className="tabular">{formatMoney(preview)}</span>
            </p>
          )}
          {error && <p className="text-sm font-medium text-alert">{error}</p>}
        </div>
      )}
    </Sheet>
  )
}
