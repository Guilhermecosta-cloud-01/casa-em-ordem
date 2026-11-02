import { type Big, numberErrorMessage, type ParseOptions, parseBrNumber } from '@/lib/decimal'
import { formatMoneyInput, formatNumberInput } from '@/lib/format'
import { isMeasureUnit, type Unit } from '@/lib/units'
import type { PriceBasis, QuantityFields } from '../types'

/** Estado do formulário de item: números como texto, no padrão brasileiro. */
export interface ItemFormState {
  name: string
  category: string
  brand: string
  packages: string
  quantity: string
  unit: Unit
  unitPrice: string
  priceBasis: PriceBasis
  notes: string
}

export interface ItemFormValues {
  name: string
  category: string
  brand: string | null
  packages: string
  quantity: string | null
  unit: Unit
  unit_price: string | null
  price_basis: PriceBasis
  notes: string | null
}

export type ItemFormErrors = Partial<Record<keyof ItemFormState, string>>

const PACKAGES: ParseOptions = { maxDecimals: 3, allowZero: false, max: 9999 }
const QUANTITY: ParseOptions = { maxDecimals: 3, allowZero: false, max: 999999 }
const PRICE: ParseOptions = { maxDecimals: 2, allowZero: true, max: 9999999 }

export function emptyItemForm(): ItemFormState {
  return {
    name: '',
    category: 'outros',
    brand: '',
    packages: '1',
    quantity: '',
    unit: 'un',
    unitPrice: '',
    priceBasis: 'package',
    notes: '',
  }
}

export function itemToForm(item: QuantityFields & { name: string; category: string; brand: string | null; notes: string | null }): ItemFormState {
  return {
    name: item.name,
    category: item.category,
    brand: item.brand ?? '',
    packages: formatNumberInput(item.packages),
    quantity: formatNumberInput(item.quantity),
    unit: item.unit,
    unitPrice: formatMoneyInput(item.unit_price),
    priceBasis: item.price_basis,
    notes: item.notes ?? '',
  }
}

/** O conteúdo por embalagem só faz sentido em unidades medidas ou contadas. */
export function unitAcceptsContent(unit: Unit): boolean {
  return isMeasureUnit(unit) || unit === 'un'
}

/** Com conteúdo informado, o preço pode ser por embalagem ou por kg/L/un. */
export function showsPriceBasis(state: Pick<ItemFormState, 'unit' | 'quantity'>): boolean {
  return unitAcceptsContent(state.unit) && state.quantity.trim() !== ''
}

export function validateItemForm(
  state: ItemFormState,
): { ok: true; values: ItemFormValues; numbers: { packages: Big; quantity: Big | null; price: Big | null } } | { ok: false; errors: ItemFormErrors } {
  const errors: ItemFormErrors = {}
  const name = state.name.trim()
  if (!name) errors.name = 'Informe o nome do produto.'
  else if (name.length > 120) errors.name = 'Use no máximo 120 caracteres.'

  const packages = parseBrNumber(state.packages, PACKAGES)
  if (!packages.ok) {
    errors.packages = packages.error === 'zero' ? 'A quantidade precisa ser maior que zero.' : numberErrorMessage(packages.error, PACKAGES)
  }

  const contentAllowed = unitAcceptsContent(state.unit)
  const quantity = contentAllowed && state.quantity.trim() !== '' ? parseBrNumber(state.quantity, QUANTITY) : null
  if (quantity && !quantity.ok) {
    errors.quantity = quantity.error === 'zero' ? 'O conteúdo não pode ser zero.' : numberErrorMessage(quantity.error, QUANTITY)
  }

  const price = state.unitPrice.trim() !== '' ? parseBrNumber(state.unitPrice, PRICE) : null
  if (price && !price.ok) errors.unitPrice = numberErrorMessage(price.error, PRICE)

  if (state.brand.trim().length > 80) errors.brand = 'Use no máximo 80 caracteres.'
  if (state.notes.trim().length > 500) errors.notes = 'Use no máximo 500 caracteres.'

  if (Object.keys(errors).length > 0 || !packages.ok || (quantity && !quantity.ok) || (price && !price.ok)) {
    return { ok: false, errors }
  }

  const quantityValue = quantity?.ok ? quantity.value : null
  const priceValue = price?.ok ? price.value : null
  return {
    ok: true,
    values: {
      name,
      category: state.category,
      brand: state.brand.trim() || null,
      packages: packages.value.toString(),
      quantity: quantityValue?.toString() ?? null,
      unit: state.unit,
      unit_price: priceValue?.toString() ?? null,
      // Sem conteúdo, preço por embalagem e por unidade são a mesma coisa.
      price_basis: quantityValue === null ? 'package' : state.priceBasis,
      notes: state.notes.trim() || null,
    },
    numbers: { packages: packages.value, quantity: quantityValue, price: priceValue },
  }
}

/** Só os campos que mudaram (para não sobrescrever o que outra pessoa alterou). */
export function diffItem<T extends Record<string, unknown>>(before: T, after: Partial<T>): Partial<T> {
  const patch: Partial<T> = {}
  for (const key of Object.keys(after) as Array<keyof T>) {
    const a = before[key]
    const b = after[key]
    const same =
      a === b ||
      (a !== null && b !== null && a !== undefined && b !== undefined && typeof a !== 'boolean' && String(a) === String(b)) ||
      (isNumeric(a) && isNumeric(b) && Number(a) === Number(b))
    if (!same) patch[key] = b
  }
  return patch
}

function isNumeric(value: unknown): boolean {
  return (typeof value === 'number' || typeof value === 'string') && value !== '' && Number.isFinite(Number(value))
}
