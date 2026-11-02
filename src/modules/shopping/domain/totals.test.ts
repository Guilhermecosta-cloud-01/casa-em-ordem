import { describe, expect, it } from 'vitest'
import type { Unit } from '@/lib/units'
import type { PriceBasis } from '../types'
import { budgetStatus, contentTotal, describeContentTotal, describeQuantity, lineTotal, listTotals } from './totals'

function item(
  packages: number,
  quantity: number | null,
  unit: Unit,
  unit_price: number | null,
  price_basis: PriceBasis = 'package',
  is_purchased = false,
) {
  return { packages, quantity, unit, unit_price, price_basis, is_purchased }
}

describe('total de cada item', () => {
  it('multiplica o preço da embalagem pela quantidade de embalagens', () => {
    // 3 pacotes de arroz de 5 kg a R$ 25,90 cada: não é R$ 25,90, é R$ 77,70
    expect(lineTotal(item(3, 5, 'kg', 25.9))?.toString()).toBe('77.7')
    expect(lineTotal(item(12, 1, 'L', 4.99))?.toString()).toBe('59.88')
  })

  it('calcula preço por kg e por litro convertendo g e mL', () => {
    expect(lineTotal(item(1, 1.5, 'kg', 39.9, 'measure'))?.toString()).toBe('59.85')
    expect(lineTotal(item(2, 500, 'g', 39.9, 'measure'))?.toString()).toBe('39.9')
    expect(lineTotal(item(1, 350, 'mL', 10, 'measure'))?.toString()).toBe('3.5')
    expect(lineTotal(item(2, null, 'duzia', 6, 'measure'))?.toString()).toBe('12')
  })

  it('arredonda cada linha em centavos, como no cupom', () => {
    expect(lineTotal(item(1, 1.234, 'kg', 7.99, 'measure'))?.toString()).toBe('9.86') // 9,85966
    expect(lineTotal(item(3, null, 'un', 0.333))?.toString()).toBe('1') // 0,999
  })

  it('não inventa total para item sem preço', () => {
    expect(lineTotal(item(2, 1, 'kg', null))).toBeNull()
  })

  it('aceita valores como texto vindos do banco', () => {
    expect(lineTotal({ packages: '3.000', quantity: '5.000', unit: 'kg', unit_price: '25.90', price_basis: 'package' })?.toString()).toBe('77.7')
  })
})

describe('embalagens × conteúdo', () => {
  it('3 pacotes de 5 kg são 3 embalagens e 15 kg de conteúdo', () => {
    const arroz = item(3, 5, 'kg', 25.9)
    expect(describeQuantity(arroz)).toBe('3 × 5 kg')
    expect(contentTotal(arroz)?.amount.toString()).toBe('15')
    expect(describeContentTotal(arroz)).toBe('15 kg no total')
  })

  it('converte totais para a unidade mais legível', () => {
    expect(describeContentTotal(item(2, 500, 'g', null))).toBe('1 kg no total')
    expect(describeContentTotal(item(6, 350, 'mL', null))).toBe('2,1 L no total')
    expect(describeContentTotal(item(1, 2, 'L', null))).toBeNull()
  })

  it('descreve itens sem conteúdo informado', () => {
    expect(describeQuantity(item(2, null, 'pacote', null))).toBe('2 pacotes')
    expect(describeQuantity(item(1, null, 'duzia', null))).toBe('1 dúzia')
    expect(describeQuantity(item(1, 1.5, 'kg', null))).toBe('1,5 kg')
    expect(describeQuantity(item(6, null, 'un', null))).toBe('6 un')
  })
})

describe('totais da lista', () => {
  const items = [
    item(3, 5, 'kg', 25.9, 'package', true), // 77,70 comprado
    item(1, 1.5, 'kg', 39.9, 'measure', false), // 59,85 pendente
    item(2, null, 'duzia', 6, 'package', true), // 12,00 comprado
    item(1, null, 'un', null, 'package', false), // sem preço
  ]

  it('soma estimado, comprado e pendente e conta o progresso', () => {
    const totals = listTotals(items)
    expect(totals.estimated.toString()).toBe('149.55')
    expect(totals.purchased.toString()).toBe('89.7')
    expect(totals.pending.toString()).toBe('59.85')
    expect(totals.itemsCount).toBe(4)
    expect(totals.purchasedCount).toBe(2)
    expect(totals.unpricedCount).toBe(1)
    expect(totals.progress).toBe(0.5)
  })

  it('recalcula ao alterar quantidade ou preço', () => {
    const changed = items.map((it, i) => (i === 0 ? { ...it, packages: 4 } : it))
    expect(listTotals(changed).estimated.toString()).toBe('175.45') // + 25,90
  })

  it('lista vazia não divide por zero', () => {
    const totals = listTotals([])
    expect(totals.progress).toBe(0)
    expect(totals.estimated.toString()).toBe('0')
  })

  it('compara com o orçamento', () => {
    const totals = listTotals(items)
    const ok = budgetStatus(200, totals.estimated)
    expect(ok?.difference.toString()).toBe('50.45')
    expect(ok?.over).toBe(false)
    const over = budgetStatus('100', totals.estimated)
    expect(over?.over).toBe(true)
    expect(over?.difference.toString()).toBe('-49.55')
    expect(budgetStatus(null, totals.estimated)).toBeNull()
  })
})
