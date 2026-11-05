import { DecimalField, MoneyField, SelectField, TextArea, TextField } from '@/components/ui/Field'
import { Minus, Plus } from 'lucide-react'
import { IconButton } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/Controls'
import { Big, parseBrNumber } from '@/lib/decimal'
import { formatMoney, formatNumberInput } from '@/lib/format'
import { priceBasisLabel, UNIT_INFO, UNITS, type Unit } from '@/lib/units'
import { allCategories, guessCategory } from '../categories'
import { type ItemFormErrors, type ItemFormState, showsPriceBasis, unitAcceptsContent } from '../domain/itemForm'
import { describeContentTotal, lineTotal } from '../domain/totals'

/** Campos de quantidade e preço de um item (usados na lista e no catálogo). */
export function ItemFields({
  state,
  onChange,
  errors,
  autoCategory = true,
  showNotes = true,
}: {
  state: ItemFormState
  onChange: (next: ItemFormState) => void
  errors: ItemFormErrors
  autoCategory?: boolean
  showNotes?: boolean
}) {
  const set = <K extends keyof ItemFormState>(key: K, value: ItemFormState[K]) => onChange({ ...state, [key]: value })

  const packages = parseBrNumber(state.packages, { maxDecimals: 3, allowZero: false })
  const quantity = state.quantity.trim() ? parseBrNumber(state.quantity, { maxDecimals: 3, allowZero: false }) : null
  const price = state.unitPrice.trim() ? parseBrNumber(state.unitPrice, { maxDecimals: 2 }) : null
  const contentAllowed = unitAcceptsContent(state.unit)
  const basisVisible = showsPriceBasis(state)

  const preview =
    packages.ok && (!quantity || quantity.ok)
      ? {
          packages: packages.value.toString(),
          quantity: contentAllowed && quantity?.ok ? quantity.value.toString() : null,
          unit: state.unit,
          unit_price: price?.ok ? price.value.toString() : null,
          price_basis: basisVisible ? state.priceBasis : ('package' as const),
        }
      : null
  const total = preview ? lineTotal(preview) : null
  const contentText = preview ? describeContentTotal(preview) : null

  const stepPackages = (delta: number) => {
    const current = packages.ok ? packages.value : new Big(1)
    const next = current.plus(delta)
    if (next.gt(0)) set('packages', formatNumberInput(next))
  }

  const priceLabel = basisVisible
    ? 'Preço estimado'
    : `Preço estimado por ${state.unit === 'un' ? 'unidade' : UNIT_INFO[state.unit].singular}`

  return (
    <div className="space-y-5">
      <TextField
        label="Nome do produto"
        value={state.name}
        onChange={(e) => {
          const name = e.target.value
          const next = { ...state, name }
          if (autoCategory && (state.category === 'outros' || state.category === guessCategory(state.name))) {
            next.category = guessCategory(name)
          }
          onChange(next)
        }}
        error={errors.name}
        maxLength={120}
        autoCapitalize="sentences"
      />

      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Categoria" value={state.category} onChange={(e) => set('category', e.target.value)}>
          {allCategories().map((c) => (
            <option key={c.id} value={c.id}>
              {c.emoji} {c.label}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Marca (opcional)"
          value={state.brand}
          onChange={(e) => set('brand', e.target.value)}
          error={errors.brand}
          maxLength={80}
        />
      </div>

      <fieldset className="space-y-4 rounded-[var(--radius-panel)] bg-paper p-4">
        <legend className="sr-only">Quantidade</legend>
        <div className="flex items-end gap-2">
          <IconButton
            label="Diminuir quantidade"
            tone="pen"
            size="lg"
            className="mb-0.5 border-[1.5px] border-pen-line bg-card"
            disabled={!packages.ok || !packages.value.gt(1)}
            onClick={() => stepPackages(-1)}
          >
            <Minus className="size-5" strokeWidth={2.5} />
          </IconButton>
          <DecimalField
            containerClassName="flex-1"
            className="text-center font-tag text-xl font-semibold"
            label={contentAllowed && state.quantity.trim() ? 'Quantidade de embalagens' : 'Quantidade'}
            value={state.packages}
            onChange={(e) => set('packages', e.target.value)}
            error={errors.packages}
          />
          <IconButton
            label="Aumentar quantidade"
            tone="pen"
            size="lg"
            className="mb-0.5 border-[1.5px] border-pen-line bg-card"
            onClick={() => stepPackages(1)}
          >
            <Plus className="size-5" strokeWidth={2.5} />
          </IconButton>
        </div>
        <div className={contentAllowed ? 'grid grid-cols-2 gap-3' : undefined}>
          <SelectField
            label="Unidade de medida"
            value={state.unit}
            onChange={(e) => {
              const unit = e.target.value as Unit
              onChange({ ...state, unit, quantity: unitAcceptsContent(unit) ? state.quantity : '' })
            }}
          >
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {UNIT_INFO[u].option}
              </option>
            ))}
          </SelectField>
          {contentAllowed && (
            <DecimalField
              label="Conteúdo de cada (opcional)"
              value={state.quantity}
              onChange={(e) => set('quantity', e.target.value)}
              error={errors.quantity}
              suffix={UNIT_INFO[state.unit].short}
              placeholder="ex.: 5"
            />
          )}
        </div>
        {contentText && <p className="text-sm font-semibold text-ink-2">{contentText}</p>}
        {contentAllowed && !state.quantity.trim() && (
          <p className="text-sm text-ink-2">
            Preencha o conteúdo para embalagens (ex.: 3 pacotes de 5 kg). Deixe vazio para itens a granel.
          </p>
        )}
      </fieldset>

      <div className="space-y-3">
        <MoneyField
          label={priceLabel}
          value={state.unitPrice}
          onChange={(e) => set('unitPrice', e.target.value)}
          error={errors.unitPrice}
          hint={basisVisible ? undefined : 'Opcional. Usado para estimar o total da lista.'}
        />
        {basisVisible && (
          <Segmented
            label="O preço é"
            value={state.priceBasis}
            onChange={(v) => set('priceBasis', v)}
            options={[
              { value: 'package', label: 'por embalagem' },
              { value: 'measure', label: priceBasisLabel('measure', state.unit) },
            ]}
          />
        )}
        <p className="flex items-baseline justify-between rounded-[var(--radius-field)] bg-pen-soft px-4 py-3">
          <span className="font-semibold">Total deste item</span>
          <span className="font-tag text-2xl font-bold tabular">{total ? formatMoney(total) : '—'}</span>
        </p>
      </div>

      {showNotes && (
        <TextArea
          label="Observações (opcional)"
          value={state.notes}
          onChange={(e) => set('notes', e.target.value)}
          error={errors.notes}
          placeholder="Ex.: tipo 1, pegar o da embalagem amarela"
          rows={2}
          maxLength={500}
        />
      )}
    </div>
  )
}
