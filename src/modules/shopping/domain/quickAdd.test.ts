import { describe, expect, it } from 'vitest'
import { guessCategory } from '../categories'
import { parseQuickAdd } from './quickAdd'

function parse(input: string) {
  const result = parseQuickAdd(input)
  if (!result) return null
  return {
    name: result.name,
    packages: result.packages?.toString() ?? null,
    quantity: result.quantity?.toString() ?? null,
    unit: result.unit,
  }
}

describe('adição rápida', () => {
  it('só o nome', () => {
    expect(parse('arroz')).toEqual({ name: 'Arroz', packages: null, quantity: null, unit: null })
  })

  it('quantidade de embalagens e conteúdo', () => {
    expect(parse('3 arroz 5kg')).toEqual({ name: 'Arroz', packages: '3', quantity: '5', unit: 'kg' })
    expect(parse('3 arroz 5 kg')).toEqual({ name: 'Arroz', packages: '3', quantity: '5', unit: 'kg' })
    expect(parse('2x sabão em pó')).toEqual({ name: 'Sabão em pó', packages: '2', quantity: null, unit: null })
    expect(parse('2 x arroz')).toEqual({ name: 'Arroz', packages: '2', quantity: null, unit: null })
  })

  it('medida no início', () => {
    expect(parse('1,5 kg carne moída')).toEqual({ name: 'Carne moída', packages: null, quantity: '1.5', unit: 'kg' })
    expect(parse('500g queijo')).toEqual({ name: 'Queijo', packages: null, quantity: '500', unit: 'g' })
    expect(parse('2 pacotes de macarrão')).toEqual({ name: 'Macarrão', packages: '2', quantity: null, unit: 'pacote' })
    expect(parse('1 dúzia de ovos')).toEqual({ name: 'Ovos', packages: '1', quantity: null, unit: 'duzia' })
  })

  it('medida no fim', () => {
    expect(parse('coca 2L')).toEqual({ name: 'Coca', packages: null, quantity: '2', unit: 'L' })
    expect(parse('leite 1 litro')).toEqual({ name: 'Leite', packages: null, quantity: '1', unit: 'L' })
    expect(parse('ovos 2 dz')).toEqual({ name: 'Ovos', packages: '2', quantity: null, unit: 'duzia' })
    expect(parse('2 caixas de leite 1L')).toEqual({ name: 'Leite', packages: '2', quantity: '1', unit: 'L' })
  })

  it('números que não são medida ficam no nome', () => {
    expect(parse('Café 3 Corações')).toEqual({ name: 'Café 3 Corações', packages: null, quantity: null, unit: null })
    expect(parse('Arroz 7 grãos')).toEqual({ name: 'Arroz 7 grãos', packages: null, quantity: null, unit: null })
  })

  it('texto vazio não cria item', () => {
    expect(parse('   ')).toBeNull()
  })
})

describe('sugestão de categoria', () => {
  it('reconhece produtos comuns', () => {
    expect(guessCategory('Arroz 5 kg')).toBe('mercearia')
    expect(guessCategory('Feijão carioca')).toBe('mercearia')
    expect(guessCategory('Tomate')).toBe('hortifruti')
    expect(guessCategory('Picanha')).toBe('acougue')
    expect(guessCategory('Detergente')).toBe('limpeza')
    expect(guessCategory('Papel higiênico')).toBe('higiene')
    expect(guessCategory('Pão francês')).toBe('padaria')
    expect(guessCategory('Ração para gato')).toBe('pet')
  })

  it('prefere a expressão mais específica', () => {
    expect(guessCategory('Leite condensado')).toBe('mercearia')
    expect(guessCategory('Leite integral')).toBe('frios')
    expect(guessCategory('Água sanitária')).toBe('limpeza')
    expect(guessCategory('Água com gás')).toBe('bebidas')
    expect(guessCategory('Peito de peru')).toBe('frios')
  })

  it('palavras curtas precisam aparecer inteiras', () => {
    expect(guessCategory('Sal grosso')).toBe('mercearia')
    expect(guessCategory('Salsicha')).toBe('frios')
  })

  it('sem pista, vai para Outros', () => {
    expect(guessCategory('Presente da vovó')).toBe('outros')
  })
})
