import { describe, expect, it } from 'vitest'
import { parseBrNumber } from './decimal'
import { formatMoney, formatNumber, formatPercent, parseLocalDate } from './format'

function value(input: string, options?: Parameters<typeof parseBrNumber>[1]) {
  const result = parseBrNumber(input, options)
  if (!result.ok) throw new Error(`"${input}" deveria ser válido (${result.error})`)
  return result.value.toString()
}

function error(input: string, options?: Parameters<typeof parseBrNumber>[1]) {
  const result = parseBrNumber(input, options)
  if (result.ok) throw new Error(`"${input}" deveria ser inválido`)
  return result.error
}

describe('entrada de valores no padrão brasileiro', () => {
  it('aceita vírgula decimal e ponto de milhar', () => {
    expect(value('12,50')).toBe('12.5')
    expect(value('1.234,56')).toBe('1234.56')
    expect(value('12.345.678,90')).toBe('12345678.9')
    expect(value('0,99')).toBe('0.99')
    expect(value(',5')).toBe('0.5')
  })

  it('aceita "R$", espaços e espaço não separável', () => {
    expect(value('R$ 12,00')).toBe('12')
    expect(value('R$ 7')).toBe('7')
    expect(value('  3  ')).toBe('3')
  })

  it('interpreta o ponto sozinho como milhar ou decimal conforme o formato', () => {
    expect(value('1.299')).toBe('1299') // mil duzentos e noventa e nove
    expect(value('12.5')).toBe('12.5')
    expect(value('0.250', { maxDecimals: 3 })).toBe('0.25')
    expect(value('7.00')).toBe('7')
  })

  it('aceita o formato com vírgula de milhar e ponto decimal', () => {
    expect(value('1,234.56')).toBe('1234.56')
  })

  it('bloqueia negativos, vazios, letras e excesso de casas decimais', () => {
    expect(error('')).toBe('empty')
    expect(error('   ')).toBe('empty')
    expect(error('-5')).toBe('negative')
    expect(error('abc')).toBe('invalid')
    expect(error('12,5,0')).toBe('invalid')
    expect(error('1.2.3')).toBe('invalid')
    expect(error('12,555')).toBe('too_many_decimals')
    expect(error('1,2345', { maxDecimals: 3 })).toBe('too_many_decimals')
  })

  it('bloqueia zero quando o campo exige valor positivo', () => {
    expect(error('0', { allowZero: false })).toBe('zero')
    expect(error('0,000', { allowZero: false, maxDecimals: 3 })).toBe('zero')
    expect(value('0')).toBe('0')
  })

  it('respeita o limite máximo', () => {
    expect(error('10000', { max: 9999 })).toBe('too_large')
  })
})

describe('formatação', () => {
  it('formata reais com arredondamento meio para cima', () => {
    expect(formatMoney(48)).toBe('R$ 48,00')
    expect(formatMoney('1234.5')).toBe('R$ 1.234,50')
    expect(formatMoney('0.005')).toBe('R$ 0,01')
    expect(formatMoney('2.675')).toBe('R$ 2,68') // em ponto flutuante daria 2,67
    expect(formatMoney(null)).toBe('—')
  })

  it('formata números e percentuais', () => {
    expect(formatNumber('1.5')).toBe('1,5')
    expect(formatNumber('15.000')).toBe('15')
    expect(formatNumber('1234.5678')).toBe('1.234,568')
    expect(formatPercent('31.428571')).toBe('31,43%')
  })

  it('lê datas sem fuso como data local', () => {
    const date = parseLocalDate('2026-11-02')
    expect(date.getDate()).toBe(2)
    expect(date.getMonth()).toBe(10)
  })
})
