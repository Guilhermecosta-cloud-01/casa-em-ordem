import { describe, expect, it } from 'vitest'
import { axisMoneyFormatter, niceScale } from './chartScale'

describe('escala do gráfico de preços', () => {
  it('usa marcas redondas que cobrem todos os valores', () => {
    expect(niceScale([37.8, 43, 47.8]).ticks).toEqual([35, 40, 45, 50])
    expect(niceScale([4.79, 4.99, 5.19]).ticks).toEqual([4.6, 4.8, 5, 5.2])
  })

  it('valor único ganha uma faixa em volta', () => {
    expect(niceScale([10, 10]).ticks).toEqual([9, 10, 11])
  })

  it('não desce abaixo de zero', () => {
    expect(niceScale([0.5, 3]).lo).toBe(0)
  })

  it('nunca usa passo menor que um centavo', () => {
    const scale = niceScale([4.785, 4.79])
    expect(scale.step).toBeGreaterThanOrEqual(0.01)
    expect(new Set(scale.ticks.map(axisMoneyFormatter(scale.step))).size).toBe(scale.ticks.length)
  })

  it('formata sem centavos quando o passo é inteiro', () => {
    expect(axisMoneyFormatter(5)(35).replace(/\s/g, ' ')).toBe('R$ 35')
    expect(axisMoneyFormatter(0.2)(4.6).replace(/\s/g, ' ')).toBe('R$ 4,60')
  })
})
