import Big from 'big.js'

// Aritmética decimal exata: nada de 0,1 + 0,2 = 0,30000000000000004.
// Os cálculos internos usam até 20 casas; só a apresentação é arredondada.
Big.DP = 20
Big.RM = Big.roundHalfUp

export { Big }
export type Decimalish = Big | number | string

export function toBig(value: Decimalish): Big {
  return value instanceof Big ? value : new Big(value)
}

/** Converte valores vindos do banco (number ou string) em Big; null continua null. */
export function toBigOrNull(value: Decimalish | null | undefined): Big | null {
  if (value === null || value === undefined || value === '') return null
  return toBig(value)
}

export type NumberParseError = 'empty' | 'invalid' | 'negative' | 'zero' | 'too_many_decimals' | 'too_large'

export type NumberParseResult = { ok: true; value: Big } | { ok: false; error: NumberParseError }

export interface ParseOptions {
  /** Casas decimais aceitas (padrão 2). */
  maxDecimals?: number
  /** Aceitar zero? (padrão true). Conteúdo de embalagem, por exemplo, não aceita. */
  allowZero?: boolean
  /** Valor máximo aceito. */
  max?: number
}

const THOUSANDS_DOT = /^[1-9]\d{0,2}(\.\d{3})+$/
const THOUSANDS_COMMA = /^[1-9]\d{0,2}(,\d{3})+$/

/**
 * Lê números no padrão brasileiro, tolerando o que as pessoas digitam:
 * "12,50", "1.234,56", "R$ 7", "0,5", "12.5", "1.299" (= mil duzentos e noventa e nove).
 */
export function parseBrNumber(raw: string, options: ParseOptions = {}): NumberParseResult {
  const { maxDecimals = 2, allowZero = true, max } = options
  let text = raw.replace(/R\$/gi, '').replace(/[\s ]/g, '')
  if (text === '') return { ok: false, error: 'empty' }
  if (text.startsWith('-') || text.startsWith('−')) return { ok: false, error: 'negative' }
  if (text.startsWith('+')) text = text.slice(1)
  if (!/^[\d.,]+$/.test(text) || !/\d/.test(text)) return { ok: false, error: 'invalid' }

  const lastDot = text.lastIndexOf('.')
  const lastComma = text.lastIndexOf(',')
  let normalized: string

  if (lastDot >= 0 && lastComma >= 0) {
    // Os dois separadores: o último é o decimal.
    const decimalSep = lastComma > lastDot ? ',' : '.'
    const thousandSep = decimalSep === ',' ? '.' : ','
    const [intPart, decPart, ...rest] = text.split(decimalSep)
    if (rest.length > 0 || intPart === undefined || decPart === undefined) return { ok: false, error: 'invalid' }
    const thousandsPattern = thousandSep === '.' ? THOUSANDS_DOT : THOUSANDS_COMMA
    if (!thousandsPattern.test(intPart) || !/^\d*$/.test(decPart)) return { ok: false, error: 'invalid' }
    normalized = `${intPart.split(thousandSep).join('')}.${decPart}`
  } else if (lastComma >= 0) {
    // Só vírgula: no Brasil, é a vírgula decimal.
    const parts = text.split(',')
    if (parts.length !== 2) return { ok: false, error: 'invalid' }
    normalized = `${parts[0] || '0'}.${parts[1]}`
  } else if (lastDot >= 0) {
    // Só ponto: "1.234" é milhar; "12.5" ou "0.250" é decimal.
    if (THOUSANDS_DOT.test(text)) {
      normalized = text.split('.').join('')
    } else {
      const parts = text.split('.')
      if (parts.length !== 2) return { ok: false, error: 'invalid' }
      normalized = `${parts[0] || '0'}.${parts[1]}`
    }
  } else {
    normalized = text
  }

  if (normalized.endsWith('.')) normalized = normalized.slice(0, -1)
  const decimals = normalized.includes('.') ? normalized.split('.')[1]!.length : 0
  if (decimals > maxDecimals) return { ok: false, error: 'too_many_decimals' }

  let value: Big
  try {
    value = new Big(normalized)
  } catch {
    return { ok: false, error: 'invalid' }
  }
  if (!allowZero && value.eq(0)) return { ok: false, error: 'zero' }
  if (max !== undefined && value.gt(max)) return { ok: false, error: 'too_large' }
  return { ok: true, value }
}

export function numberErrorMessage(error: NumberParseError, options: ParseOptions = {}): string {
  switch (error) {
    case 'empty':
      return 'Preencha este campo.'
    case 'invalid':
      return 'Use só números, por exemplo 12,50.'
    case 'negative':
      return 'O valor não pode ser negativo.'
    case 'zero':
      return 'O valor precisa ser maior que zero.'
    case 'too_many_decimals': {
      const n = options.maxDecimals ?? 2
      return n === 0 ? 'Use um número inteiro.' : `Use no máximo ${n} ${n === 1 ? 'casa decimal' : 'casas decimais'}.`
    }
    case 'too_large':
      return 'Valor alto demais.'
  }
}

/** Arredonda para centavos (meio para cima), como no caixa. */
export function roundCents(value: Big): Big {
  return value.round(2, Big.roundHalfUp)
}

/** String com ponto decimal para enviar ao banco (numeric). */
export function toDbNumber(value: Big | null): string | null {
  return value === null ? null : value.toString()
}
