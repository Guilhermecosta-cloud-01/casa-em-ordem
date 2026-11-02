import { Big, roundCents, toBig, toBigOrNull } from '@/lib/decimal'
import { formatNumber } from '@/lib/format'
import { formatAmount, humanizeAmount, priceRefFactor, type Unit, UNIT_INFO } from '@/lib/units'
import type { QuantityFields } from '../types'

/**
 * Total da linha em reais, arredondado em centavos como no cupom fiscal.
 *   preço por embalagem: embalagens × preço
 *   preço por medida:    embalagens × conteúdo (em kg, L ou un) × preço
 * Igual à função SQL public.item_line_total (os testes do banco conferem).
 */
export function lineTotal(item: QuantityFields): Big | null {
  const price = toBigOrNull(item.unit_price)
  if (price === null) return null
  const packages = toBig(item.packages)
  if (item.price_basis === 'measure') {
    const content = toBigOrNull(item.quantity) ?? new Big(1)
    return roundCents(packages.times(content).times(priceRefFactor(item.unit)).times(price))
  }
  return roundCents(packages.times(price))
}

/** Conteúdo total: 3 embalagens de 5 kg → 15 kg; 2 × 500 g → 1 kg. */
export function contentTotal(item: Pick<QuantityFields, 'packages' | 'quantity' | 'unit'>): {
  amount: Big
  unit: Unit
} | null {
  const quantity = toBigOrNull(item.quantity)
  if (quantity === null) return null
  return humanizeAmount(toBig(item.packages).times(quantity), item.unit)
}

/**
 * Texto curto da quantidade:
 *   "3 × 5 kg"  (3 embalagens de 5 kg)
 *   "1,5 kg"    (1 embalagem / porção de 1,5 kg)
 *   "2 pacotes" (sem conteúdo informado)
 */
export function describeQuantity(item: Pick<QuantityFields, 'packages' | 'quantity' | 'unit'>): string {
  const packages = toBig(item.packages)
  const quantity = toBigOrNull(item.quantity)
  if (quantity === null) return formatAmount(packages, item.unit)
  if (packages.eq(1)) return formatAmount(quantity, item.unit)
  return `${formatNumber(packages)} × ${formatAmount(quantity, item.unit)}`
}

/** "15 kg no total" quando há mais de uma embalagem com conteúdo informado. */
export function describeContentTotal(item: Pick<QuantityFields, 'packages' | 'quantity' | 'unit'>): string | null {
  const total = contentTotal(item)
  if (!total || toBig(item.packages).eq(1)) return null
  return `${formatAmount(total.amount, total.unit)} no total`
}

export function packagesLabel(item: Pick<QuantityFields, 'packages' | 'quantity' | 'unit'>): string {
  const packages = toBig(item.packages)
  if (toBigOrNull(item.quantity) === null) return formatAmount(packages, item.unit)
  return `${formatNumber(packages)} ${packages.eq(1) ? 'embalagem' : 'embalagens'}`
}

export interface ListTotals {
  /** Total estimado de todos os itens com preço. */
  estimated: Big
  /** Total dos itens já marcados como comprados. */
  purchased: Big
  /** Total dos itens pendentes. */
  pending: Big
  itemsCount: number
  purchasedCount: number
  /** Itens sem preço (não entram nos totais). */
  unpricedCount: number
  /** 0 a 1 — proporção de itens comprados. */
  progress: number
}

export function listTotals(items: ReadonlyArray<QuantityFields & { is_purchased: boolean }>): ListTotals {
  let estimated = new Big(0)
  let purchased = new Big(0)
  let purchasedCount = 0
  let unpricedCount = 0
  for (const item of items) {
    const total = lineTotal(item)
    if (item.is_purchased) purchasedCount += 1
    if (total === null) {
      unpricedCount += 1
      continue
    }
    estimated = estimated.plus(total)
    if (item.is_purchased) purchased = purchased.plus(total)
  }
  return {
    estimated,
    purchased,
    pending: estimated.minus(purchased),
    itemsCount: items.length,
    purchasedCount,
    unpricedCount,
    progress: items.length === 0 ? 0 : purchasedCount / items.length,
  }
}

export interface BudgetStatus {
  budget: Big
  /** Orçamento menos o estimado: positivo = sobra; negativo = passou. */
  difference: Big
  over: boolean
  /** 0 a 1+ — quanto do orçamento o estimado ocupa. */
  usage: number
}

export function budgetStatus(budget: number | string | null | undefined, estimated: Big): BudgetStatus | null {
  const value = toBigOrNull(budget ?? null)
  if (value === null) return null
  const difference = value.minus(estimated)
  return {
    budget: value,
    difference,
    over: difference.lt(0),
    usage: value.eq(0) ? (estimated.gt(0) ? Infinity : 0) : Number(estimated.div(value).toString()),
  }
}

export function unitLabel(unit: Unit): string {
  return UNIT_INFO[unit].short
}
