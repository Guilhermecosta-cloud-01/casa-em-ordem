import { Big, toBig } from '@/lib/decimal'
import { compareText } from '@/lib/text'
import { formatAmount, type Unit } from '@/lib/units'
import type { StockItem } from './types'

export const LOCATIONS = ['Despensa', 'Geladeira', 'Freezer', 'Banheiro', 'Lavanderia', 'Área de serviço'] as const
export const NO_LOCATION = 'Sem local'

export type StockStatus = 'out' | 'low' | 'ok'

export function isLow(quantity: Big, min: Big | null): boolean {
  return min !== null && quantity.lte(min)
}

export function stockStatus(item: Pick<StockItem, 'quantity' | 'min_quantity'>): StockStatus {
  const quantity = toBig(item.quantity)
  if (quantity.eq(0)) return 'out'
  return isLow(quantity, item.min_quantity === null ? null : toBig(item.min_quantity)) ? 'low' : 'ok'
}

/** Passo dos botões − e +: 100 g/mL, meio kg/L, 1 nos demais. */
export function stepFor(unit: Unit): number {
  if (unit === 'g' || unit === 'mL') return 100
  if (unit === 'kg' || unit === 'L') return 0.5
  return 1
}

export function applyDelta(quantity: number | string, delta: number): string {
  const next = toBig(quantity).plus(delta)
  return (next.lt(0) ? new Big(0) : next).toString()
}

/** Quantas unidades pôr na lista para voltar acima do mínimo (1 quando é por peso/volume). */
export function suggestedPackages(item: Pick<StockItem, 'quantity' | 'min_quantity' | 'unit'>): number {
  if (item.unit === 'g' || item.unit === 'kg' || item.unit === 'mL' || item.unit === 'L') return 1
  const quantity = toBig(item.quantity)
  const min = item.min_quantity === null ? new Big(0) : toBig(item.min_quantity)
  const missing = min.plus(1).minus(quantity)
  return Math.max(1, Math.min(99, Math.ceil(Number(missing.toString()))))
}

export function quantityLabel(item: Pick<StockItem, 'quantity' | 'unit'>): string {
  return formatAmount(item.quantity, item.unit)
}

/** Acabando primeiro; depois por nome. Agrupado por local. */
export function groupByLocation(items: StockItem[]): { location: string; items: StockItem[] }[] {
  const order = new Map<string, number>([...LOCATIONS.map((l, i) => [l, i] as const)])
  const groups = new Map<string, StockItem[]>()
  for (const item of items) {
    const key = item.location?.trim() || NO_LOCATION
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  const rank = (s: StockStatus) => (s === 'out' ? 0 : s === 'low' ? 1 : 2)
  return [...groups.entries()]
    .sort(([a], [b]) => {
      if (a === NO_LOCATION) return 1
      if (b === NO_LOCATION) return -1
      return (order.get(a) ?? 99) - (order.get(b) ?? 99) || compareText(a, b)
    })
    .map(([location, list]) => ({
      location,
      items: list.sort((x, y) => rank(stockStatus(x)) - rank(stockStatus(y)) || compareText(x.name, y.name)),
    }))
}
