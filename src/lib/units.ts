import { Big, type Decimalish, toBig } from './decimal'
import { formatNumber } from './format'

/** Unidades de medida aceitas nos itens, produtos e preços. */
export const UNITS = ['un', 'kg', 'g', 'L', 'mL', 'pacote', 'caixa', 'duzia'] as const
export type Unit = (typeof UNITS)[number]

interface UnitInfo {
  /** Rótulo curto exibido ao lado do número. */
  short: string
  singular: string
  plural: string
  /** Nome no seletor. */
  option: string
}

export const UNIT_INFO: Record<Unit, UnitInfo> = {
  un: { short: 'un', singular: 'unidade', plural: 'unidades', option: 'Unidade' },
  kg: { short: 'kg', singular: 'kg', plural: 'kg', option: 'kg' },
  g: { short: 'g', singular: 'g', plural: 'g', option: 'g' },
  L: { short: 'L', singular: 'L', plural: 'L', option: 'L' },
  mL: { short: 'mL', singular: 'mL', plural: 'mL', option: 'mL' },
  pacote: { short: 'pct', singular: 'pacote', plural: 'pacotes', option: 'Pacote' },
  caixa: { short: 'cx', singular: 'caixa', plural: 'caixas', option: 'Caixa' },
  duzia: { short: 'dz', singular: 'dúzia', plural: 'dúzias', option: 'Dúzia' },
}

export function isUnit(value: unknown): value is Unit {
  return typeof value === 'string' && (UNITS as readonly string[]).includes(value)
}

/** Unidades medidas (peso ou volume) — vendidas "a granel" ou com conteúdo. */
export function isMeasureUnit(unit: Unit): boolean {
  return unit === 'kg' || unit === 'g' || unit === 'L' || unit === 'mL'
}

/**
 * Unidade usada para preço "por medida": kg para g/kg, L para mL/L e a
 * própria unidade nos demais casos (un, dúzia, pacote, caixa).
 */
export function priceRefUnit(unit: Unit): Unit {
  if (unit === 'g') return 'kg'
  if (unit === 'mL') return 'L'
  return unit
}

/** Fator para converter a unidade na unidade de referência (g → kg = 0,001). */
export function priceRefFactor(unit: Unit): Big {
  return unit === 'g' || unit === 'mL' ? new Big('0.001') : new Big(1)
}

/** "2 pacotes", "1 dúzia", "1,5 kg", "3 un" */
export function formatAmount(amount: Decimalish, unit: Unit): string {
  const value = toBig(amount)
  const info = UNIT_INFO[unit]
  if (unit === 'un') return `${formatNumber(value)} un`
  if (unit === 'pacote' || unit === 'caixa' || unit === 'duzia') {
    return `${formatNumber(value)} ${value.eq(1) ? info.singular : info.plural}`
  }
  return `${formatNumber(value)} ${info.short}`
}

/**
 * Escolhe a unidade mais legível para mostrar um total de conteúdo:
 * 1500 g → 1,5 kg; 0,25 L → 250 mL.
 */
export function humanizeAmount(amount: Decimalish, unit: Unit): { amount: Big; unit: Unit } {
  const value = toBig(amount)
  if (unit === 'g' && value.gte(1000)) return { amount: value.div(1000), unit: 'kg' }
  if (unit === 'mL' && value.gte(1000)) return { amount: value.div(1000), unit: 'L' }
  if (unit === 'kg' && value.lt(1) && value.gt(0)) return { amount: value.times(1000), unit: 'g' }
  if (unit === 'L' && value.lt(1) && value.gt(0)) return { amount: value.times(1000), unit: 'mL' }
  return { amount: value, unit }
}

/** Rótulo do preço: "por kg", "por embalagem", "por dúzia"… */
export function priceBasisLabel(basis: 'package' | 'measure', unit: Unit): string {
  if (basis === 'package') return 'por embalagem'
  const ref = priceRefUnit(unit)
  if (ref === 'un') return 'por unidade'
  return `por ${UNIT_INFO[ref].singular}`
}
