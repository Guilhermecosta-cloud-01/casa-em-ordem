import { type Big, parseBrNumber } from '@/lib/decimal'
import { normalizeText } from '@/lib/text'
import type { Unit } from '@/lib/units'

/**
 * Interpreta o texto da adição rápida, para incluir itens com poucos toques:
 *   "arroz"                 → 1 arroz
 *   "3 arroz 5kg"           → 3 embalagens de 5 kg
 *   "2x sabão em pó"        → 2 embalagens
 *   "1,5 kg carne moída"    → 1,5 kg
 *   "2 pacotes de macarrão" → 2 pacotes
 *   "coca 2L"               → 1 × 2 L
 * Números que não acompanham uma unidade conhecida ficam no nome
 * ("Café 3 Corações" continua "Café 3 Corações").
 */
export interface QuickAddResult {
  name: string
  packages: Big | null
  quantity: Big | null
  unit: Unit | null
}

const UNIT_WORDS: Record<string, Unit> = {
  kg: 'kg', kgs: 'kg', quilo: 'kg', quilos: 'kg', kilo: 'kg', kilos: 'kg',
  g: 'g', gr: 'g', grs: 'g', grama: 'g', gramas: 'g',
  l: 'L', lt: 'L', lts: 'L', litro: 'L', litros: 'L',
  ml: 'mL',
  un: 'un', und: 'un', unid: 'un', unids: 'un', unidade: 'un', unidades: 'un',
  pct: 'pacote', pcts: 'pacote', pacote: 'pacote', pacotes: 'pacote',
  cx: 'caixa', cxs: 'caixa', caixa: 'caixa', caixas: 'caixa',
  dz: 'duzia', duzia: 'duzia', duzias: 'duzia',
}

const MEASURE_UNITS = new Set<Unit>(['kg', 'g', 'L', 'mL'])
const NUMBER = String.raw`\d+(?:[.,]\d+)?`

function parseAmount(text: string): Big | null {
  const parsed = parseBrNumber(text, { maxDecimals: 3, allowZero: false, max: 999999 })
  return parsed.ok ? parsed.value : null
}

function unitOf(word: string | undefined): Unit | null {
  if (!word) return null
  return UNIT_WORDS[normalizeText(word)] ?? null
}

/** Tenta ler "<número><unidade>" ou "<número> <unidade>" no início do array de palavras. */
function readMeasure(tokens: string[], index: number): { amount: Big; unit: Unit; length: number } | null {
  const token = tokens[index]
  if (!token) return null
  const glued = new RegExp(`^(${NUMBER})([a-zA-ZçÇúÚ]+)$`).exec(token)
  if (glued) {
    const unit = unitOf(glued[2])
    const amount = parseAmount(glued[1]!)
    if (unit && amount) return { amount, unit, length: 1 }
    return null
  }
  if (new RegExp(`^${NUMBER}$`).test(token)) {
    const unit = unitOf(tokens[index + 1])
    const amount = parseAmount(token)
    if (unit && amount) return { amount, unit, length: 2 }
  }
  return null
}

function applyMeasure(result: QuickAddResult, measure: { amount: Big; unit: Unit }) {
  if (MEASURE_UNITS.has(measure.unit)) {
    // kg, g, L, mL: conteúdo de cada embalagem
    result.quantity = measure.amount
    result.unit = measure.unit
  } else {
    // un, pacote, caixa, dúzia: contam embalagens
    result.packages = measure.amount
    result.unit = measure.unit
  }
}

export function parseQuickAdd(input: string): QuickAddResult | null {
  const tokens = input.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return null
  const result: QuickAddResult = { name: '', packages: null, quantity: null, unit: null }

  let start = 0
  let end = tokens.length

  // Medida no início: "1,5 kg carne", "2 pacotes de macarrão", "500g queijo"
  const leading = readMeasure(tokens, 0)
  if (leading && leading.length < end) {
    applyMeasure(result, leading)
    start = leading.length
  } else {
    // Contagem no início: "3 arroz", "2x arroz", "2 x arroz"
    const first = tokens[0]!
    const count = new RegExp(`^(${NUMBER})\\s*[x×]?$`, 'i').exec(first)
    if (count && tokens.length > 1) {
      const amount = parseAmount(count[1]!)
      if (amount) {
        result.packages = amount
        start = 1
        if (/^[x×]$/i.test(tokens[1] ?? '') && tokens.length > 2) start = 2
      }
    }
  }
  if (normalizeText(tokens[start] ?? '') === 'de' && end - start > 1) start += 1

  // Medida no fim: "arroz 5kg", "leite 1 litro"
  if (end - start > 1) {
    for (const length of [1, 2]) {
      const index = end - length
      if (index <= start) continue
      const trailing = readMeasure(tokens, index)
      if (trailing && trailing.length === length) {
        if (MEASURE_UNITS.has(trailing.unit) || result.unit === null) {
          applyMeasure(result, trailing)
          end = index
        }
        break
      }
    }
  }

  const name = tokens.slice(start, end).join(' ').trim()
  if (!name) return null
  result.name = name.charAt(0).toLocaleUpperCase('pt-BR') + name.slice(1)
  return result
}
