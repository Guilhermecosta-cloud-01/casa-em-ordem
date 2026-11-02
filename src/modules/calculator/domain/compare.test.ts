import { describe, expect, it } from 'vitest'
import { formatMoney, formatPercent } from '@/lib/format'
import { compareOptions, type OptionInput } from './compare'
import { simulateEquivalent } from './simulate'
import type { CalcUnit } from './units'

let seq = 0
function opt(price: string, content: string, unit: CalcUnit, extra: Partial<OptionInput> = {}): OptionInput {
  seq += 1
  return { id: `o${seq}`, name: '', brand: '', price, content, unit, packages: '', ...extra }
}
const blank = (): OptionInput => opt('', '', 'g')

function money(row: { perReference: { toString(): string } } | undefined) {
  return row ? formatMoney(row.perReference.toString()) : null
}

describe('exemplo obrigatório: 250 g por R$ 12,00 × 100 g por R$ 7,00', () => {
  const a = opt('12,00', '250', 'g')
  const b = opt('7,00', '100', 'g')
  const result = compareOptions({ options: [a, b] })
  const rowA = result.rows.find((r) => r.option.id === a.id)!
  const rowB = result.rows.find((r) => r.option.id === b.id)!

  it('calcula preço por kg e por 100 g de cada opção', () => {
    expect(result.status).toBe('ready')
    expect(rowA.metrics.map((m) => [m.label, formatMoney(m.value)])).toEqual([
      ['kg', 'R$ 48,00'],
      ['100 g', 'R$ 4,80'],
    ])
    expect(rowB.metrics.map((m) => [m.label, formatMoney(m.value)])).toEqual([
      ['kg', 'R$ 70,00'],
      ['100 g', 'R$ 7,00'],
    ])
  })

  it('indica a opção A como a mais econômica, com economia de 31,43%', () => {
    expect(result.bestIds).toEqual([a.id])
    expect(result.isTie).toBe(false)
    expect(formatPercent(rowB.savingsPercent)).toBe('31,43%')
    expect(formatMoney(rowB.differencePerReference)).toBe('R$ 22,00')
    expect(rowA.isBest).toBe(true)
    expect(rowB.isBest).toBe(false)
  })

  it('exibe a mensagem simples pedida', () => {
    expect(result.message).toBe(
      'A embalagem de 250 g oferece o melhor custo-benefício. Você paga R$ 48,00 por kg, contra R$ 70,00 por kg na embalagem de 100 g.',
    )
  })

  it('explica que o menor preço unitário não é o menor gasto imediato', () => {
    expect(result.notes.join(' ')).toContain('não é o mesmo que menor gasto agora')
    expect(result.notes.join(' ')).toContain('R$ 12,00 no caixa, contra R$ 7,00 da embalagem de 100 g')
  })
})

describe('conversões de unidade', () => {
  it('compara gramas com quilogramas', () => {
    const kg = opt('20,00', '1', 'kg')
    const g = opt('11,00', '500', 'g')
    const result = compareOptions({ options: [kg, g] })
    expect(result.bestIds).toEqual([kg.id])
    expect(result.rows.map(money)).toEqual(['R$ 20,00', 'R$ 22,00'])
  })

  it('compara mililitros com litros', () => {
    const big = opt('9,00', '2', 'L')
    const can = opt('2,50', '350', 'mL')
    const result = compareOptions({ options: [can, big] })
    expect(result.dimension).toBe('volume')
    expect(result.bestIds).toEqual([big.id])
    const rowCan = result.rows.find((r) => r.option.id === can.id)!
    expect(rowCan.metrics.map((m) => [m.label, formatMoney(m.value)])).toEqual([
      ['L', 'R$ 7,14'],
      ['100 mL', 'R$ 0,71'],
    ])
    expect(result.message).toContain('R$ 4,50 por litro')
  })

  it('compara unidades e dúzias', () => {
    const dozen = opt('12,00', '1', 'duzia')
    const tray = opt('27,00', '30', 'un')
    const result = compareOptions({ options: [dozen, tray] })
    expect(result.bestIds).toEqual([tray.id])
    const rowDozen = result.rows.find((r) => r.option.id === dozen.id)!
    expect(rowDozen.metrics.map((m) => [m.label, formatMoney(m.value)])).toEqual([
      ['un', 'R$ 1,00'],
      ['dúzia', 'R$ 12,00'],
    ])
  })
})

describe('três ou mais opções', () => {
  it('ordena todas, destaca a melhor e mantém as demais visíveis', () => {
    const a = opt('25,00', '1', 'kg')
    const b = opt('13,00', '500', 'g')
    const c = opt('45,00', '2', 'kg')
    const result = compareOptions({ options: [a, b, c] })
    expect(result.rows.map((r) => r.option.id)).toEqual([c.id, a.id, b.id])
    expect(result.rows.map((r) => r.rank)).toEqual([1, 2, 3])
    expect(result.rows.map(money)).toEqual(['R$ 22,50', 'R$ 25,00', 'R$ 26,00'])
    expect(result.message).toBe(
      'A embalagem de 2 kg oferece o melhor custo-benefício. Você paga R$ 22,50 por kg, contra R$ 25,00 por kg na embalagem de 1 kg e R$ 26,00 por kg na embalagem de 500 g.',
    )
  })

  it('usa o nome da opção quando informado', () => {
    const a = opt('25,00', '1', 'kg', { name: 'Arroz', brand: 'Tio João' })
    const b = opt('20,00', '1', 'kg', { name: 'Arroz', brand: 'Camil' })
    const result = compareOptions({ options: [a, b] })
    expect(result.message.startsWith('A opção B (Arroz Camil) oferece o melhor custo-benefício.')).toBe(true)
    expect(result.message).toContain('na opção A (Arroz Tio João)')
  })

  it('opções sem nome e com o mesmo tamanho são chamadas pela letra', () => {
    const result = compareOptions({ options: [opt('10,00', '1', 'kg'), opt('9,00', '1', 'kg')] })
    expect(result.message.startsWith('A opção B oferece')).toBe(true)
  })

  it('ignora opção totalmente vazia e avisa', () => {
    const result = compareOptions({ options: [opt('12,00', '250', 'g'), opt('7,00', '100', 'g'), blank()] })
    expect(result.status).toBe('ready')
    expect(result.rows).toHaveLength(2)
    expect(result.notes.join(' ')).toContain('A opção C está vazia')
  })

  it('reconhece empate', () => {
    const result = compareOptions({ options: [opt('12,00', '250', 'g'), opt('24,00', '500', 'g')] })
    expect(result.isTie).toBe(true)
    expect(result.bestIds).toHaveLength(2)
    expect(result.message).toBe(
      'A embalagem de 250 g e a embalagem de 500 g têm o mesmo preço por kg: R$ 48,00.',
    )
  })
})

describe('precisão decimal', () => {
  it('não erra por arredondamento de ponto flutuante', () => {
    // Em ponto flutuante, 0,30 ÷ 3 = 0,09999999999999999 e daria vitória falsa.
    const result = compareOptions({ options: [opt('0,30', '3', 'un'), opt('0,10', '1', 'un')] })
    expect(result.isTie).toBe(true)
  })

  it('arredonda só na apresentação', () => {
    const result = compareOptions({ options: [opt('10,00', '3', 'un'), opt('3,34', '1', 'un')] })
    // 10/3 = 3,3333… < 3,34
    expect(result.rows[0]!.option.input.content).toBe('3')
    expect(formatMoney(result.rows[0]!.perReference)).toBe('R$ 3,33')
  })
})

describe('validações', () => {
  it('bloqueia preço negativo e não indica vencedor', () => {
    const result = compareOptions({ options: [opt('-5', '100', 'g'), opt('7,00', '100', 'g')] })
    expect(result.status).toBe('invalid')
    expect(result.bestIds).toEqual([])
    expect(result.rows).toEqual([])
    expect(result.options[0]!.errors.price).toBe('O valor não pode ser negativo.')
  })

  it('bloqueia conteúdo igual a zero (sem divisão por zero)', () => {
    const result = compareOptions({ options: [opt('12,00', '0', 'g'), opt('7,00', '100', 'g')] })
    expect(result.status).toBe('invalid')
    expect(result.options[0]!.errors.content).toBe('O conteúdo não pode ser zero.')
  })

  it('bloqueia preço zero e campos vazios em opção iniciada', () => {
    const zero = compareOptions({ options: [opt('0', '100', 'g'), opt('7,00', '100', 'g')] })
    expect(zero.options[0]!.errors.price).toBe('O preço precisa ser maior que zero.')
    const missing = compareOptions({ options: [opt('', '100', 'g'), opt('7,00', '100', 'g')] })
    expect(missing.status).toBe('invalid')
    expect(missing.options[0]!.errors.price).toBe('Preencha este campo.')
  })

  it('aceita decimais no padrão brasileiro', () => {
    const result = compareOptions({ options: [opt('1.234,56', '1,5', 'kg'), opt('10,5', '0,5', 'kg')] })
    expect(result.status).toBe('ready')
    expect(result.rows.map(money)).toEqual(['R$ 21,00', 'R$ 823,04'])
  })

  it('pede pelo menos duas opções', () => {
    const result = compareOptions({ options: [opt('12,00', '250', 'g'), blank()] })
    expect(result.status).toBe('incomplete')
    expect(result.bestIds).toEqual([])
  })

  it('quantidade de embalagens precisa ser inteira', () => {
    const result = compareOptions({ options: [opt('12,00', '250', 'g', { packages: '1,5' }), opt('7,00', '100', 'g')] })
    expect(result.options[0]!.errors.packages).toBe('Use um número inteiro de embalagens.')
  })
})

describe('unidades incompatíveis', () => {
  it('não converte gramas em mililitros sem densidade', () => {
    const result = compareOptions({ options: [opt('20,00', '1', 'kg'), opt('18,00', '900', 'mL')] })
    expect(result.status).toBe('incompatible')
    expect(result.needsDensity).toBe(true)
    expect(result.bestIds).toEqual([])
  })

  it('compara peso com volume quando a densidade é informada', () => {
    const kg = opt('20,00', '1', 'kg')
    const ml = opt('18,00', '900', 'mL')
    const result = compareOptions({ options: [kg, ml], density: '0,92' })
    // 900 mL × 0,92 g/mL = 828 g → R$ 21,74/kg
    expect(result.status).toBe('ready')
    expect(result.bestIds).toEqual([kg.id])
    expect(money(result.rows[1])).toBe('R$ 21,74')
    expect(result.notes[0]).toContain('densidade de 0,92 g/mL')
  })

  it('não compara peso com unidades', () => {
    const result = compareOptions({ options: [opt('20,00', '1', 'kg'), opt('2,00', '6', 'un')], density: '1' })
    expect(result.status).toBe('incompatible')
    expect(result.needsDensity).toBe(false)
  })
})

describe('simulação de quantidade equivalente', () => {
  const a = opt('12,00', '250', 'g')
  const b = opt('7,00', '100', 'g')
  const comparison = compareOptions({ options: [a, b] })

  it('500 g: custo proporcional, embalagens inteiras e sobra', () => {
    const sim = simulateEquivalent(comparison, { amount: '500', unit: 'g' })
    const rowA = sim.rows.find((r) => r.option.id === a.id)!
    const rowB = sim.rows.find((r) => r.option.id === b.id)!
    expect(formatMoney(rowA.theoreticalCost)).toBe('R$ 24,00')
    expect(formatMoney(rowB.theoreticalCost)).toBe('R$ 35,00')
    expect(rowA.packagesNeeded).toBe(2)
    expect(rowB.packagesNeeded).toBe(5)
    expect(formatMoney(rowA.realCost)).toBe('R$ 24,00')
    expect(formatMoney(rowB.realCost)).toBe('R$ 35,00')
    expect(rowA.leftoverBase.toString()).toBe('0')
    expect(sim.cheapestRealIds).toEqual([a.id])
  })

  it('300 g: diferencia o valor proporcional do valor pago no caixa', () => {
    const sim = simulateEquivalent(comparison, { amount: '300', unit: 'g' })
    const rowA = sim.rows.find((r) => r.option.id === a.id)!
    const rowB = sim.rows.find((r) => r.option.id === b.id)!
    expect(formatMoney(rowA.theoreticalCost)).toBe('R$ 14,40')
    expect(rowA.packagesNeeded).toBe(2)
    expect(formatMoney(rowA.realCost)).toBe('R$ 24,00')
    expect(rowA.leftoverBase.toString()).toBe('200')
    expect(formatMoney(rowB.realCost)).toBe('R$ 21,00')
    expect(sim.cheapestRealIds).toEqual([b.id])
    expect(sim.message).toContain('a embalagem de 100 g sai mais barata no caixa')
    expect(sim.message).toContain('sobram 200 g')
  })

  it('aceita a quantidade em outra unidade da mesma dimensão', () => {
    const sim = simulateEquivalent(comparison, { amount: '1', unit: 'kg' })
    expect(sim.rows.find((r) => r.option.id === a.id)!.packagesNeeded).toBe(4)
  })

  it('conta embalagens inteiras sem erro de ponto flutuante (1,1 kg em pacotes de 0,1 kg)', () => {
    const c = compareOptions({ options: [opt('1,00', '0,1', 'kg'), opt('5,00', '1', 'kg')] })
    const sim = simulateEquivalent(c, { amount: '1,1', unit: 'kg' })
    const small = sim.rows.find((r) => r.option.input.content === '0,1')!
    expect(small.packagesNeeded).toBe(11) // em ponto flutuante daria 12
    expect(small.leftoverBase.toString()).toBe('0')
  })

  it('valida a quantidade desejada', () => {
    expect(simulateEquivalent(comparison, { amount: '0', unit: 'g' }).error).toBe(
      'A quantidade precisa ser maior que zero.',
    )
    expect(simulateEquivalent(comparison, { amount: '1', unit: 'L' }).status).toBe('incompatible')
    const invalid = compareOptions({ options: [opt('-1', '1', 'g'), opt('1', '1', 'g')] })
    expect(simulateEquivalent(invalid, { amount: '1', unit: 'g' }).status).toBe('unavailable')
  })
})

describe('compras múltiplas', () => {
  it('multiplica preço e conteúdo pela quantidade de embalagens sem mudar o preço por kg', () => {
    const result = compareOptions({ options: [opt('12,00', '250', 'g', { packages: '3' }), opt('7,00', '100', 'g')] })
    const row = result.rows[0]!
    expect(formatMoney(row.option.totalPrice!)).toBe('R$ 36,00')
    expect(row.option.totalContentBase!.toString()).toBe('750')
    expect(money(row)).toBe('R$ 48,00')
  })
})
