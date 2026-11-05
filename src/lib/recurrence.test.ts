import { describe, expect, it } from 'vitest'
import { addMonths } from './dates'
import { addRecurrence, describeRecurrence, nextAfter, occurrencesBetween } from './recurrence'

describe('recorrência', () => {
  it('mês sem o dia usa o último dia, sem escorregar nos meses seguintes', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addRecurrence('2026-01-31', 'monthly', 1, 2)).toBe('2026-03-31')
    expect(addRecurrence('2028-02-29', 'yearly', 1, 1)).toBe('2029-02-28')
    expect(addRecurrence('2028-02-29', 'yearly', 1, 4)).toBe('2032-02-29')
  })

  it('próxima ocorrência depois de uma data mantém o ritmo', () => {
    expect(nextAfter('2026-11-02', 'weekly', 1, '2026-11-04')).toBe('2026-11-09')
    expect(nextAfter('2026-11-02', 'weekly', 1, '2026-11-02')).toBe('2026-11-09')
    expect(nextAfter('2024-01-10', 'daily', 1, '2026-11-04')).toBe('2026-11-05')
    expect(nextAfter('2026-01-31', 'monthly', 1, '2026-04-15')).toBe('2026-04-30')
    expect(nextAfter('2020-05-03', 'yearly', 1, '2026-11-04')).toBe('2027-05-03')
  })

  it('lista as ocorrências de uma janela', () => {
    expect(occurrencesBetween('2026-10-01', 'weekly', 2, '2026-11-01', '2026-11-30')).toEqual([
      '2026-11-12',
      '2026-11-26',
    ])
    expect(occurrencesBetween('2026-11-10', 'none', 1, '2026-11-01', '2026-11-30')).toEqual(['2026-11-10'])
    expect(occurrencesBetween('2026-12-10', 'none', 1, '2026-11-01', '2026-11-30')).toEqual([])
    expect(occurrencesBetween('1990-11-03', 'yearly', 1, '2026-11-01', '2026-11-30')).toEqual(['2026-11-03'])
    expect(occurrencesBetween('2026-11-01', 'daily', 1, '2026-11-01', '2026-11-30', '2026-11-03')).toEqual([
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
    ])
  })

  it('descreve a regra', () => {
    expect(describeRecurrence('weekly', 1)).toBe('Toda semana')
    expect(describeRecurrence('monthly', 6)).toBe('A cada 6 meses')
    expect(describeRecurrence('none', 1)).toBe('')
  })
})
