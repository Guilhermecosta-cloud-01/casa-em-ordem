import { Big, numberErrorMessage, parseBrNumber } from '@/lib/decimal'
import { formatMoney, formatNumber } from '@/lib/format'
import { type ComparisonResult, CONTENT_RULES, DENSITY_RULES, optionSubject, type OptionEvaluation } from './compare'
import { CALC_UNIT_INFO, type CalcUnit, describeBaseAmount, describeAmount, toBaseUnits } from './units'

/**
 * Simulação de quantidade equivalente: quanto custa comprar, por exemplo,
 * 500 g com cada opção — no valor proporcional (teórico) e no valor real,
 * levando embalagens inteiras.
 */
export interface SimulationInput {
  amount: string
  unit: CalcUnit
  density?: string
}

export interface SimulationRow {
  option: OptionEvaluation
  /** Custo proporcional: preço por unidade × quantidade desejada. */
  theoreticalCost: Big
  /** Embalagens inteiras necessárias para alcançar a quantidade. */
  packagesNeeded: number
  /** Valor pago no caixa: embalagens × preço da embalagem. */
  realCost: Big
  /** Conteúdo comprado (unidade-base). */
  boughtBase: Big
  /** Sobra (unidade-base). */
  leftoverBase: Big
  /** Quanto se paga além do proporcional por levar embalagens inteiras. */
  extraCost: Big
}

export interface SimulationResult {
  status: 'ready' | 'invalid' | 'incompatible' | 'unavailable'
  error?: string
  targetBase?: Big
  targetLabel?: string
  rows: SimulationRow[]
  cheapestRealIds: string[]
  message: string
}

export function simulateEquivalent(comparison: ComparisonResult, input: SimulationInput): SimulationResult {
  const empty: SimulationResult = { status: 'unavailable', rows: [], cheapestRealIds: [], message: '' }
  if (comparison.status !== 'ready' || !comparison.dimension) {
    return { ...empty, message: 'A simulação aparece quando a comparação estiver completa.' }
  }
  if (input.amount.trim() === '') {
    return { ...empty, message: 'Informe a quantidade que vocês querem comprar.' }
  }
  const amount = parseBrNumber(input.amount, CONTENT_RULES)
  if (!amount.ok) {
    return {
      ...empty,
      status: 'invalid',
      error:
        amount.error === 'zero' ? 'A quantidade precisa ser maior que zero.' : numberErrorMessage(amount.error, CONTENT_RULES),
      message: '',
    }
  }

  let targetBase = toBaseUnits(amount.value, input.unit)
  const targetDimension = CALC_UNIT_INFO[input.unit].dimension
  if (targetDimension !== comparison.dimension) {
    // Comparação feita em peso (com densidade) e alvo informado em volume.
    const density = input.density ? parseBrNumber(input.density, DENSITY_RULES) : null
    if (comparison.dimension === 'mass' && targetDimension === 'volume' && density?.ok) {
      targetBase = targetBase.times(density.value)
    } else {
      return {
        ...empty,
        status: 'incompatible',
        error: 'Use uma unidade compatível com as opções comparadas.',
        message: '',
      }
    }
  }

  const options = comparison.options
  const rows: SimulationRow[] = comparison.rows.map(({ option }) => {
    const contentBase = option.contentBase!
    const theoreticalCost = option.pricePerBase!.times(targetBase)
    const packagesNeeded = Number(targetBase.div(contentBase).round(0, Big.roundUp).toString())
    const realCost = option.price!.times(packagesNeeded)
    const boughtBase = contentBase.times(packagesNeeded)
    return {
      option,
      theoreticalCost,
      packagesNeeded,
      realCost,
      boughtBase,
      leftoverBase: boughtBase.minus(targetBase),
      extraCost: realCost.minus(theoreticalCost),
    }
  })

  const minReal = rows.reduce((min, r) => (r.realCost.lt(min) ? r.realCost : min), rows[0]!.realCost)
  const cheapestRealIds = rows.filter((r) => r.realCost.eq(minReal)).map((r) => r.option.id)
  const targetLabel = describeAmount(amount.value, input.unit, formatNumber)
  const dimension = comparison.dimension

  const describeLeftover = (row: SimulationRow) =>
    row.leftoverBase.gt(0) ? `sobram ${describeBaseAmount(row.leftoverBase, dimension, formatNumber)}` : 'sem sobra'
  const packagesText = (n: number) => `${n} ${n === 1 ? 'embalagem' : 'embalagens'}`

  let message: string
  const cheapest = rows.find((r) => cheapestRealIds.includes(r.option.id))!
  const bestUnit = rows.find((r) => comparison.bestIds.includes(r.option.id))!
  if (cheapestRealIds.length > 1) {
    message = `Para comprar ${targetLabel}, ${cheapestRealIds.length} opções empatam no caixa: ${formatMoney(minReal)}.`
  } else if (!comparison.bestIds.includes(cheapest.option.id)) {
    message =
      `Para comprar ${targetLabel}, ${optionSubject(cheapest.option, options)} sai mais barata no caixa ` +
      `(${formatMoney(cheapest.realCost)}, ${packagesText(cheapest.packagesNeeded)}, ${describeLeftover(cheapest)}), ` +
      `mesmo com preço por quantidade maior. Com ${optionSubject(bestUnit.option, options)} vocês pagariam ` +
      `${formatMoney(bestUnit.realCost)} (${packagesText(bestUnit.packagesNeeded)}, ${describeLeftover(bestUnit)}).`
  } else {
    message =
      `Para comprar ${targetLabel}, ${optionSubject(cheapest.option, options)} também é a mais barata no caixa: ` +
      `${formatMoney(cheapest.realCost)} (${packagesText(cheapest.packagesNeeded)}, ${describeLeftover(cheapest)}).`
  }

  return {
    status: 'ready',
    targetBase,
    targetLabel,
    rows,
    cheapestRealIds,
    message,
  }
}
