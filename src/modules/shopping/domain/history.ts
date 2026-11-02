import { Big, toBig, toBigOrNull } from '@/lib/decimal'
import { normalizeText } from '@/lib/text'
import { priceRefFactor, priceRefUnit } from '@/lib/units'
import type { Purchase, QuantityFields } from '../types'

export interface PurchaseAmount {
  value: Big
  /** "paid" = valor informado do cupom; "estimated" = soma estimada dos itens. */
  kind: 'paid' | 'estimated'
}

export function purchaseAmount(purchase: Pick<Purchase, 'paid_total' | 'estimated_total'>): PurchaseAmount {
  const paid = toBigOrNull(purchase.paid_total)
  return paid !== null ? { value: paid, kind: 'paid' } : { value: toBig(purchase.estimated_total), kind: 'estimated' }
}

/** Compra anterior com o mesmo nome (ex.: a "Compra do mês" passada). */
export function previousSameName(purchases: readonly Purchase[], current: Purchase): Purchase | null {
  const name = normalizeText(current.name)
  const older = purchases
    .filter(
      (p) =>
        p.id !== current.id &&
        normalizeText(p.name) === name &&
        (p.purchased_on < current.purchased_on || (p.purchased_on === current.purchased_on && p.created_at < current.created_at)),
    )
    .sort((a, b) => (a.purchased_on === b.purchased_on ? (a.created_at < b.created_at ? 1 : -1) : a.purchased_on < b.purchased_on ? 1 : -1))
  return older[0] ?? null
}

export interface AmountComparison {
  difference: Big
  percent: Big | null
  kind: 'paid' | 'estimated'
}

/**
 * Compara duas compras usando o mesmo tipo de valor nas duas (pago com pago,
 * estimado com estimado), para não misturar coisas diferentes.
 */
export function compareAmounts(current: Purchase, previous: Purchase): AmountComparison | null {
  const currentPaid = toBigOrNull(current.paid_total)
  const previousPaid = toBigOrNull(previous.paid_total)
  const [a, b, kind] =
    currentPaid !== null && previousPaid !== null
      ? [currentPaid, previousPaid, 'paid' as const]
      : [toBig(current.estimated_total), toBig(previous.estimated_total), 'estimated' as const]
  if (b.eq(0)) return { difference: a.minus(b), percent: null, kind }
  return { difference: a.minus(b), percent: a.minus(b).div(b).times(100), kind }
}

/** Preço por kg / L / unidade, para comparar embalagens diferentes. */
export function normalizedUnitPrice(item: QuantityFields): { value: Big; refUnit: string } | null {
  const price = toBigOrNull(item.unit_price)
  if (price === null) return null
  const refUnit = priceRefUnit(item.unit)
  if (item.price_basis === 'measure') return { value: price, refUnit }
  const content = (toBigOrNull(item.quantity) ?? new Big(1)).times(priceRefFactor(item.unit))
  if (content.eq(0)) return null
  return { value: price.div(content), refUnit }
}

export interface MonthGroup<T> {
  key: string
  label: string
  items: T[]
}

export function groupByMonth<T>(items: readonly T[], dateOf: (item: T) => string): MonthGroup<T>[] {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const key = dateOf(item).slice(0, 7)
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return [...groups.entries()].map(([key, groupItems]) => {
    const [year, month] = key.split('-').map(Number)
    const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(year!, month! - 1, 1))
    return { key, label: label.charAt(0).toUpperCase() + label.slice(1), items: groupItems }
  })
}
