import { describe, expect, it } from 'vitest'
import { applyDelta, groupByLocation, stockStatus, suggestedPackages } from './domain'
import type { StockItem } from './types'

const item = (patch: Partial<StockItem>): StockItem => ({
  id: patch.name ?? 'x',
  family_id: 'f',
  product_id: null,
  name: 'Item',
  category: 'outros',
  unit: 'un',
  quantity: 0,
  min_quantity: null,
  location: null,
  notes: null,
  is_low: false,
  created_by: null,
  updated_by: null,
  created_at: '',
  updated_at: '',
  ...patch,
})

describe('estoque', () => {
  it('sabe quando está acabando', () => {
    expect(stockStatus({ quantity: 0, min_quantity: null })).toBe('out')
    expect(stockStatus({ quantity: 2, min_quantity: 2 })).toBe('low')
    expect(stockStatus({ quantity: '2.5', min_quantity: '2' })).toBe('ok')
    expect(stockStatus({ quantity: 5, min_quantity: null })).toBe('ok')
  })

  it('nunca fica negativo e soma sem erro de arredondamento', () => {
    expect(applyDelta(1, -2)).toBe('0')
    expect(applyDelta('0.1', 0.2)).toBe('0.3')
  })

  it('sugere quanto comprar para passar do mínimo', () => {
    expect(suggestedPackages({ quantity: 1, min_quantity: 2, unit: 'un' })).toBe(2)
    expect(suggestedPackages({ quantity: 0, min_quantity: null, unit: 'pacote' })).toBe(1)
    expect(suggestedPackages({ quantity: 0.2, min_quantity: 1, unit: 'kg' })).toBe(1)
  })

  it('agrupa por local, com o que está acabando primeiro', () => {
    const groups = groupByLocation([
      item({ name: 'Sabão', location: 'Lavanderia', quantity: 3 }),
      item({ name: 'Arroz', location: 'Despensa', quantity: 5, min_quantity: 2 }),
      item({ name: 'Feijão', location: 'Despensa', quantity: 1, min_quantity: 2 }),
      item({ name: 'Pilhas', quantity: 4 }),
    ])
    expect(groups.map((g) => g.location)).toEqual(['Despensa', 'Lavanderia', 'Sem local'])
    expect(groups[0]!.items.map((i) => i.name)).toEqual(['Feijão', 'Arroz'])
  })
})
