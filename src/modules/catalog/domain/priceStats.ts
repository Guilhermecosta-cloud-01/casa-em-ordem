import { Big, toBig, toBigOrNull } from '@/lib/decimal'
import { formatMoney } from '@/lib/format'
import type { PriceRecord, ProductStats } from '../types'

const REF_LABEL: Record<string, string> = {
  kg: 'kg',
  L: 'L',
  un: 'un',
  pacote: 'pacote',
  caixa: 'caixa',
  duzia: 'dúzia',
}

/** "R$ 5,18/kg" */
export function formatNormalized(value: number | string | Big, refUnit: string): string {
  return `${formatMoney(value)}/${REF_LABEL[refUnit] ?? refUnit}`
}

export function refUnitLabel(refUnit: string): string {
  return REF_LABEL[refUnit] ?? refUnit
}

/** Variação percentual de `from` para `to` (ex.: 5 → 6 = +20%). */
export function variationPercent(from: Big, to: Big): Big | null {
  if (from.eq(0)) return null
  return to.minus(from).div(from).times(100)
}

export type Trend = 'up' | 'down' | 'stable'

export function trendOf(variation: Big | null): Trend | null {
  if (variation === null) return null
  // Abaixo de meio por cento consideramos estável.
  if (variation.abs().lt(0.5)) return 'stable'
  return variation.gt(0) ? 'up' : 'down'
}

export interface ProductTrend {
  productId: string
  last: Big
  previous: Big
  variation: Big
  trend: Trend
  refUnit: string
  lastDate: string
  previousDate: string
}

/** Variação entre os dois últimos registros comparáveis de cada produto. */
export function productTrend(stats: ProductStats): ProductTrend | null {
  const previous = toBigOrNull(stats.previous_normalized)
  if (previous === null || !stats.previous_recorded_on) return null
  const last = toBig(stats.last_normalized)
  const variation = variationPercent(previous, last)
  const trend = trendOf(variation)
  if (variation === null || trend === null) return null
  return {
    productId: stats.product_id,
    last,
    previous,
    variation,
    trend,
    refUnit: stats.ref_unit,
    lastDate: stats.last_recorded_on,
    previousDate: stats.previous_recorded_on,
  }
}

export function priceMovers(stats: ProductStats[]): { up: ProductTrend[]; down: ProductTrend[] } {
  const trends = stats.map(productTrend).filter((t): t is ProductTrend => t !== null)
  return {
    up: trends.filter((t) => t.trend === 'up').sort((a, b) => b.variation.cmp(a.variation)),
    down: trends.filter((t) => t.trend === 'down').sort((a, b) => a.variation.cmp(b.variation)),
  }
}

export interface RecordSummary {
  count: number
  last: PriceRecord | null
  /** Registro anterior comparável (mesma unidade de referência que o último). */
  previous: PriceRecord | null
  variation: Big | null
  trend: Trend | null
  lowest: PriceRecord | null
  highest: PriceRecord | null
  /** Registros comparáveis com o último (mesma unidade de referência). */
  comparableCount: number
  /** Último preço em cada estabelecimento (apenas fatos registrados). */
  byStore: Array<{ storeId: string | null; last: PriceRecord; count: number }>
}

function byDateDesc(a: PriceRecord, b: PriceRecord): number {
  if (a.recorded_on !== b.recorded_on) return a.recorded_on < b.recorded_on ? 1 : -1
  return a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0
}

export function summarizeRecords(records: PriceRecord[]): RecordSummary {
  const sorted = [...records].sort(byDateDesc)
  const last = sorted[0] ?? null
  const comparable = last ? sorted.filter((r) => r.ref_unit === last.ref_unit) : []
  const previous = comparable[1] ?? null
  const variation =
    last && previous ? variationPercent(toBig(previous.normalized_price), toBig(last.normalized_price)) : null

  let lowest: PriceRecord | null = null
  let highest: PriceRecord | null = null
  for (const record of comparable) {
    const value = toBig(record.normalized_price)
    if (!lowest || value.lt(toBig(lowest.normalized_price))) lowest = record
    if (!highest || value.gt(toBig(highest.normalized_price))) highest = record
  }

  const stores = new Map<string, { storeId: string | null; last: PriceRecord; count: number }>()
  for (const record of sorted) {
    const key = record.store_id ?? '—'
    const current = stores.get(key)
    if (current) current.count += 1
    else stores.set(key, { storeId: record.store_id, last: record, count: 1 })
  }

  return {
    count: sorted.length,
    last,
    previous,
    variation,
    trend: trendOf(variation),
    lowest,
    highest,
    comparableCount: comparable.length,
    byStore: [...stores.values()],
  }
}

/**
 * Só faz sentido comparar estabelecimentos com dados suficientes: pelo menos
 * dois estabelecimentos, cada um com dois ou mais registros comparáveis.
 * Sem isso, o app mostra apenas os preços registrados, sem eleger "o mais barato".
 */
export function canCompareStores(summary: RecordSummary): boolean {
  const withEnough = summary.byStore.filter((s) => s.storeId !== null && s.count >= 2)
  return withEnough.length >= 2
}

export { Big }
