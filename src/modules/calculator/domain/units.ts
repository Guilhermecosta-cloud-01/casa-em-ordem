import { Big } from '@/lib/decimal'

/** Unidades aceitas na calculadora. */
export const CALC_UNITS = ['g', 'kg', 'mL', 'L', 'un', 'duzia'] as const
export type CalcUnit = (typeof CALC_UNITS)[number]

export type Dimension = 'mass' | 'volume' | 'count'

interface CalcUnitInfo {
  dimension: Dimension
  /** Quantas unidades-base (g, mL ou un) cabem em 1 desta unidade. */
  toBase: Big
  short: string
  option: string
}

export const CALC_UNIT_INFO: Record<CalcUnit, CalcUnitInfo> = {
  g: { dimension: 'mass', toBase: new Big(1), short: 'g', option: 'g' },
  kg: { dimension: 'mass', toBase: new Big(1000), short: 'kg', option: 'kg' },
  mL: { dimension: 'volume', toBase: new Big(1), short: 'mL', option: 'mL' },
  L: { dimension: 'volume', toBase: new Big(1000), short: 'L', option: 'L' },
  un: { dimension: 'count', toBase: new Big(1), short: 'un', option: 'un' },
  duzia: { dimension: 'count', toBase: new Big(12), short: 'dz', option: 'dúzia' },
}

export const DIMENSION_LABEL: Record<Dimension, string> = {
  mass: 'peso',
  volume: 'volume',
  count: 'unidades',
}

export function isCalcUnit(value: unknown): value is CalcUnit {
  return typeof value === 'string' && (CALC_UNITS as readonly string[]).includes(value)
}

/** Converte para a unidade-base da dimensão (g, mL ou un). */
export function toBaseUnits(amount: Big, unit: CalcUnit): Big {
  return amount.times(CALC_UNIT_INFO[unit].toBase)
}

/** Converte da unidade-base para a unidade pedida. */
export function fromBaseUnits(amountBase: Big, unit: CalcUnit): Big {
  return amountBase.div(CALC_UNIT_INFO[unit].toBase)
}

export function baseUnitOf(dimension: Dimension): CalcUnit {
  return dimension === 'mass' ? 'g' : dimension === 'volume' ? 'mL' : 'un'
}

/** Unidade de referência para preço: kg, L ou unidade. */
export function referenceUnitOf(dimension: Dimension): CalcUnit {
  return dimension === 'mass' ? 'kg' : dimension === 'volume' ? 'L' : 'un'
}

/** "250 g", "1,5 kg", "12 un", "1 dúzia" a partir de um valor em unidade-base. */
export function describeBaseAmount(amountBase: Big, dimension: Dimension, format: (b: Big) => string): string {
  if (dimension === 'mass') {
    return amountBase.gte(1000) ? `${format(amountBase.div(1000))} kg` : `${format(amountBase)} g`
  }
  if (dimension === 'volume') {
    return amountBase.gte(1000) ? `${format(amountBase.div(1000))} L` : `${format(amountBase)} mL`
  }
  return `${format(amountBase)} un`
}

export function describeAmount(amount: Big, unit: CalcUnit, format: (b: Big) => string): string {
  if (unit === 'duzia') return `${format(amount)} ${amount.eq(1) ? 'dúzia' : 'dúzias'}`
  return `${format(amount)} ${CALC_UNIT_INFO[unit].short}`
}
