import { Big, numberErrorMessage, type ParseOptions, parseBrNumber } from '@/lib/decimal'
import { formatMoney, formatNumber, formatPercent } from '@/lib/format'
import {
  CALC_UNIT_INFO,
  type CalcUnit,
  describeAmount,
  type Dimension,
  referenceUnitOf,
  toBaseUnits,
} from './units'

// ---------------------------------------------------------------------------
// Entrada (texto digitado, como está no formulário)
// ---------------------------------------------------------------------------

export interface OptionInput {
  id: string
  name: string
  brand: string
  /** Preço de uma embalagem. */
  price: string
  /** Conteúdo de uma embalagem. */
  content: string
  unit: CalcUnit
  /** Quantidade de embalagens (opcional, para simular compras múltiplas). */
  packages: string
}

export interface ComparisonInput {
  options: OptionInput[]
  /** Densidade em g/mL, só para comparar peso com volume. */
  density?: string
}

export const PRICE_RULES: ParseOptions = { maxDecimals: 2, allowZero: false, max: 9_999_999 }
export const CONTENT_RULES: ParseOptions = { maxDecimals: 3, allowZero: false, max: 1_000_000 }
export const PACKAGES_RULES: ParseOptions = { maxDecimals: 0, allowZero: false, max: 999 }
export const DENSITY_RULES: ParseOptions = { maxDecimals: 4, allowZero: false, max: 30 }

// ---------------------------------------------------------------------------
// Avaliação de cada opção
// ---------------------------------------------------------------------------

export type OptionField = 'price' | 'content' | 'packages'

export interface OptionEvaluation {
  id: string
  /** A, B, C… */
  letter: string
  input: OptionInput
  state: 'empty' | 'invalid' | 'valid'
  errors: Partial<Record<OptionField, string>>
  /** Dimensão da unidade escolhida (antes de qualquer conversão). */
  dimension: Dimension
  price?: Big
  content?: Big
  packages?: Big
  /** Conteúdo na unidade-base usada na comparação (g, mL ou un). */
  contentBase?: Big
  /** R$ por unidade-base (por g, por mL ou por un). Valor exato. */
  pricePerBase?: Big
  /** Preço × embalagens. */
  totalPrice?: Big
  /** Conteúdo × embalagens, em unidade-base. */
  totalContentBase?: Big
  /** Volume convertido em peso pela densidade informada. */
  convertedWithDensity?: boolean
}

export function letterFor(index: number): string {
  return String.fromCharCode(65 + index)
}

function isBlank(option: OptionInput): boolean {
  return [option.price, option.content, option.packages, option.name, option.brand].every((v) => v.trim() === '')
}

export function evaluateOption(option: OptionInput, index: number): OptionEvaluation {
  const base: OptionEvaluation = {
    id: option.id,
    letter: letterFor(index),
    input: option,
    state: 'valid',
    errors: {},
    dimension: CALC_UNIT_INFO[option.unit].dimension,
  }
  if (isBlank(option)) return { ...base, state: 'empty' }

  const price = parseBrNumber(option.price, PRICE_RULES)
  const content = parseBrNumber(option.content, CONTENT_RULES)
  const packages = option.packages.trim() === '' ? null : parseBrNumber(option.packages, PACKAGES_RULES)

  const errors: OptionEvaluation['errors'] = {}
  if (!price.ok) {
    errors.price = price.error === 'zero' ? 'O preço precisa ser maior que zero.' : numberErrorMessage(price.error, PRICE_RULES)
  }
  if (!content.ok) {
    errors.content =
      content.error === 'zero' ? 'O conteúdo não pode ser zero.' : numberErrorMessage(content.error, CONTENT_RULES)
  }
  if (packages && !packages.ok) {
    errors.packages =
      packages.error === 'too_many_decimals' ? 'Use um número inteiro de embalagens.' : numberErrorMessage(packages.error, PACKAGES_RULES)
  }
  if (!price.ok || !content.ok || (packages && !packages.ok)) {
    return { ...base, state: 'invalid', errors }
  }

  const packagesValue = packages?.ok ? packages.value : new Big(1)
  const contentBase = toBaseUnits(content.value, option.unit)
  return {
    ...base,
    price: price.value,
    content: content.value,
    packages: packagesValue,
    contentBase,
    pricePerBase: price.value.div(contentBase),
    totalPrice: price.value.times(packagesValue),
    totalContentBase: contentBase.times(packagesValue),
  }
}

// ---------------------------------------------------------------------------
// Comparação
// ---------------------------------------------------------------------------

export type ComparisonStatus = 'incomplete' | 'invalid' | 'incompatible' | 'ready'

export interface PriceMetric {
  /** "kg", "100 g", "L", "100 mL", "un", "dúzia" */
  label: string
  value: Big
}

export interface ResultRow {
  option: OptionEvaluation
  rank: number
  isBest: boolean
  metrics: PriceMetric[]
  /** Preço na unidade de referência (por kg, por L ou por un). */
  perReference: Big
  /** Quanto esta opção custa a mais, por unidade de referência, que a melhor. */
  differencePerReference: Big
  /** Quanto a melhor opção economiza em relação a esta, em % (mesma quantidade). */
  savingsPercent: Big
}

export interface ComparisonResult {
  status: ComparisonStatus
  options: OptionEvaluation[]
  /** Dimensão comum usada na comparação. */
  dimension?: Dimension
  referenceUnit?: CalcUnit
  rows: ResultRow[]
  bestIds: string[]
  isTie: boolean
  /** Frase principal, para exibir em destaque. */
  message: string
  /** Observações complementares. */
  notes: string[]
  /** Mistura de peso e volume sem densidade informada. */
  needsDensity: boolean
  densityError?: string
}

function joinPt(parts: string[]): string {
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`
}

function contentKey(option: OptionEvaluation): string {
  return `${option.content?.toString()}|${option.input.unit}`
}

/** Nome da opção para usar em frases ("a embalagem de 250 g", "a opção B (Marca X)"). */
export function optionSubject(option: OptionEvaluation, all: OptionEvaluation[]): string {
  const name = [option.input.name.trim(), option.input.brand.trim()].filter(Boolean).join(' ')
  if (name) return `a opção ${option.letter} (${name})`
  const sameContent = all.filter((o) => o.state === 'valid' && contentKey(o) === contentKey(option))
  if (option.content && sameContent.length === 1) {
    return `a embalagem de ${describeAmount(option.content, option.input.unit, formatNumber)}`
  }
  return `a opção ${option.letter}`
}

function inPhrase(subject: string): string {
  // "a embalagem…" → "na embalagem…"; "a opção…" → "na opção…"
  return subject.startsWith('a ') ? `n${subject}` : `em ${subject}`
}

function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function metricsFor(pricePerBase: Big, dimension: Dimension, showDozen: boolean): PriceMetric[] {
  if (dimension === 'mass') {
    return [
      { label: 'kg', value: pricePerBase.times(1000) },
      { label: '100 g', value: pricePerBase.times(100) },
    ]
  }
  if (dimension === 'volume') {
    return [
      { label: 'L', value: pricePerBase.times(1000) },
      { label: '100 mL', value: pricePerBase.times(100) },
    ]
  }
  const metrics: PriceMetric[] = [{ label: 'un', value: pricePerBase }]
  if (showDozen) metrics.push({ label: 'dúzia', value: pricePerBase.times(12) })
  return metrics
}

function referenceLabel(dimension: Dimension): string {
  return dimension === 'mass' ? 'kg' : dimension === 'volume' ? 'litro' : 'unidade'
}

export function compareOptions(input: ComparisonInput): ComparisonResult {
  let options = input.options.map(evaluateOption)
  const filled = options.filter((o) => o.state !== 'empty')
  const invalid = options.filter((o) => o.state === 'invalid')
  const empty = options.filter((o) => o.state === 'empty')
  const result: ComparisonResult = {
    status: 'incomplete',
    options,
    rows: [],
    bestIds: [],
    isTie: false,
    message: '',
    notes: [],
    needsDensity: false,
  }

  if (invalid.length > 0) {
    result.status = 'invalid'
    result.message =
      invalid.length === 1
        ? `Corrija os campos da opção ${invalid[0]!.letter} para ver o resultado.`
        : `Corrija os campos das opções ${joinPt(invalid.map((o) => o.letter))} para ver o resultado.`
    return result
  }
  if (filled.length < 2) {
    result.message = 'Preencha preço e conteúdo de pelo menos duas opções.'
    return result
  }

  // Dimensões: peso, volume ou unidades. Peso × volume só com densidade.
  const dimensions = new Set(filled.map((o) => o.dimension))
  let dimension: Dimension = filled[0]!.dimension
  if (dimensions.size > 1) {
    const mixesMassAndVolume = dimensions.size === 2 && dimensions.has('mass') && dimensions.has('volume')
    const densityText = input.density?.trim() ?? ''
    if (mixesMassAndVolume && densityText !== '') {
      const density = parseBrNumber(densityText, DENSITY_RULES)
      if (!density.ok) {
        result.status = 'invalid'
        result.densityError = numberErrorMessage(density.error, DENSITY_RULES)
        result.needsDensity = true
        result.message = 'Corrija a densidade para comparar peso com volume.'
        return result
      }
      // Converte as opções em volume para gramas: g = mL × densidade.
      options = options.map((o) => {
        if (o.state !== 'valid' || o.dimension !== 'volume') return o
        const contentBase = o.contentBase!.times(density.value)
        return {
          ...o,
          contentBase,
          pricePerBase: o.price!.div(contentBase),
          totalContentBase: contentBase.times(o.packages!),
          convertedWithDensity: true,
        }
      })
      dimension = 'mass'
      result.options = options
      result.notes.push(
        `Volumes convertidos em peso com densidade de ${formatNumber(density.value, 4)} g/mL, informada por você.`,
      )
    } else {
      result.status = 'incompatible'
      result.needsDensity = mixesMassAndVolume
      result.message = mixesMassAndVolume
        ? 'Não dá para comparar peso (g, kg) com volume (mL, L) sem saber a densidade do produto. Use a mesma unidade em todas as opções ou informe a densidade.'
        : 'As unidades não são comparáveis. Use peso, volume ou unidades em todas as opções.'
      return result
    }
  }

  const valid = options.filter((o) => o.state === 'valid')
  const ranked = [...valid].sort((a, b) => a.pricePerBase!.cmp(b.pricePerBase!))
  const best = ranked[0]!
  const bestPerBase = best.pricePerBase!
  const bestIds = ranked.filter((o) => o.pricePerBase!.eq(bestPerBase)).map((o) => o.id)
  const showDozen = valid.some((o) => o.input.unit === 'duzia')
  const refFactor = CALC_UNIT_INFO[referenceUnitOf(dimension)].toBase

  result.status = 'ready'
  result.dimension = dimension
  result.referenceUnit = referenceUnitOf(dimension)
  result.bestIds = bestIds
  result.isTie = bestIds.length > 1

  let rank = 0
  let previous: Big | null = null
  result.rows = ranked.map((option, index) => {
    if (previous === null || !option.pricePerBase!.eq(previous)) rank = index + 1
    previous = option.pricePerBase!
    const perReference = option.pricePerBase!.times(refFactor)
    const difference = option.pricePerBase!.minus(bestPerBase).times(refFactor)
    const savings = option.pricePerBase!.eq(0)
      ? new Big(0)
      : option.pricePerBase!.minus(bestPerBase).div(option.pricePerBase!).times(100)
    return {
      option,
      rank,
      isBest: bestIds.includes(option.id),
      metrics: metricsFor(option.pricePerBase!, dimension, showDozen),
      perReference,
      differencePerReference: difference,
      savingsPercent: savings,
    }
  })

  // ---- Frase principal --------------------------------------------------
  const unitWord = referenceLabel(dimension)
  const money = (row: ResultRow) => `${formatMoney(row.perReference)} por ${unitWord}`
  const bestRows = result.rows.filter((r) => r.isBest)
  const others = result.rows.filter((r) => !r.isBest)

  if (result.isTie) {
    const subjects = bestRows.map((r) => optionSubject(r.option, options))
    result.message = `${capitalizeFirst(joinPt(subjects))} têm o mesmo preço por ${unitWord}: ${formatMoney(bestRows[0]!.perReference)}.`
  } else {
    const subject = optionSubject(best, options)
    const against = others.map((r) => `${money(r)} ${inPhrase(optionSubject(r.option, options))}`)
    result.message = `${capitalizeFirst(subject)} oferece o melhor custo-benefício. Você paga ${money(bestRows[0]!)}, contra ${joinPt(against)}.`
  }

  // ---- Observações ------------------------------------------------------
  for (const row of others) {
    if (formatMoney(row.perReference) === formatMoney(bestRows[0]!.perReference)) {
      result.notes.push(
        `A diferença entre ${optionSubject(best, options)} e ${optionSubject(row.option, options)} é menor que um centavo por ${unitWord}.`,
      )
    }
  }
  if (!result.isTie && others.length > 0) {
    const second = others[0]!
    result.notes.push(
      `Para a mesma quantidade, ${optionSubject(best, options)} sai ${formatPercent(second.savingsPercent)} mais barata que ${optionSubject(second.option, options)}.`,
    )
  }
  const cheaperAtRegister = others.filter((r) => r.option.price!.lt(best.price!))
  if (!result.isTie && cheaperAtRegister.length > 0) {
    const cheapest = [...cheaperAtRegister].sort((a, b) => a.option.price!.cmp(b.option.price!))[0]!
    result.notes.push(
      `Menor preço por ${unitWord} não é o mesmo que menor gasto agora: ${optionSubject(best, options)} custa ${formatMoney(best.price!)} no caixa, contra ${formatMoney(cheapest.option.price!)} d${optionSubject(cheapest.option, options)}. Compensa se vocês forem usar todo o conteúdo.`,
    )
  } else {
    result.notes.push(
      `O preço por ${unitWord} mostra o custo-benefício; o gasto no caixa depende de quantas embalagens vocês levarem.`,
    )
  }
  if (empty.length > 0) {
    result.notes.push(
      empty.length === 1
        ? `A opção ${empty[0]!.letter} está vazia e ficou fora da comparação.`
        : `As opções ${joinPt(empty.map((o) => o.letter))} estão vazias e ficaram fora da comparação.`,
    )
  }
  return result
}
