import { describe, expect, it } from 'vitest'
import type { Task } from '@/modules/tasks/types'
import { agendaEntries, monthGrid } from './domain'
import type { AgendaEvent } from './types'

const event = (patch: Partial<AgendaEvent>): AgendaEvent => ({
  id: patch.title ?? 'e',
  family_id: 'f',
  kind: 'appointment',
  title: 'Evento',
  notes: null,
  location: null,
  starts_on: '2026-11-10',
  start_time: null,
  end_time: null,
  recurrence: 'none',
  recurrence_interval: 1,
  until_on: null,
  remind_minutes: null,
  product_id: null,
  stock_item_id: null,
  created_by: null,
  updated_by: null,
  created_at: '',
  updated_at: '',
  ...patch,
})

describe('agenda', () => {
  it('junta compromissos recorrentes e tarefas com prazo, em ordem', () => {
    const entries = agendaEntries(
      [
        event({ title: 'Dentista', starts_on: '2026-11-05', start_time: '14:00:00' }),
        event({ title: 'Aniversário da vó', kind: 'important_date', starts_on: '1950-11-05', recurrence: 'yearly' }),
        event({ title: 'Trocar filtro', kind: 'maintenance', starts_on: '2026-05-20', recurrence: 'monthly', recurrence_interval: 6 }),
      ],
      [{ id: 't', title: 'Pagar luz', status: 'open', due_on: '2026-11-05' } as Task, { id: 'x', title: 'Feita', status: 'done', due_on: '2026-11-05' } as Task],
      '2026-11-01',
      '2026-11-30',
    )
    expect(entries.map((e) => (e.type === 'event' ? e.event.title : e.task.title))).toEqual([
      'Aniversário da vó',
      'Pagar luz',
      'Dentista',
      'Trocar filtro',
    ])
    expect(entries[3]!.date).toBe('2026-11-20')
  })

  it('grade do mês começa no domingo e tem 5 ou 6 semanas', () => {
    const grid = monthGrid('2026-11-01')
    expect(grid[0]).toEqual({ date: '2026-11-01', inMonth: true })
    expect(grid.length % 7).toBe(0)
    expect(monthGrid('2026-08-01')).toHaveLength(42)
  })
})
