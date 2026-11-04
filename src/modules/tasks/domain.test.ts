import { describe, expect, it } from 'vitest'
import { dueGroup, dueLabel, groupOpenTasks } from './domain'
import type { Task } from './types'

const base: Task = {
  id: '1',
  family_id: 'f',
  title: 'Tarefa',
  notes: null,
  assignee_id: null,
  due_on: null,
  priority: 'normal',
  recurrence: 'none',
  recurrence_interval: 1,
  status: 'open',
  completed_at: null,
  completed_by: null,
  next_task_id: null,
  created_by: null,
  updated_by: null,
  created_at: '',
  updated_at: '',
}
const task = (patch: Partial<Task>): Task => ({ ...base, ...patch })

describe('tarefas', () => {
  const today = '2026-11-04'

  it('separa por prazo', () => {
    expect(dueGroup('2026-11-01', today)).toBe('overdue')
    expect(dueGroup(today, today)).toBe('today')
    expect(dueGroup('2026-11-05', today)).toBe('tomorrow')
    expect(dueGroup('2026-11-11', today)).toBe('week')
    expect(dueGroup('2026-11-12', today)).toBe('later')
    expect(dueGroup(null, today)).toBe('none')
  })

  it('ordena por prazo e prioridade dentro de cada grupo', () => {
    const groups = groupOpenTasks(
      [
        task({ id: 'a', title: 'Lavar roupa', due_on: today }),
        task({ id: 'b', title: 'Pagar luz', due_on: today, priority: 'high' }),
        task({ id: 'c', title: 'Regar plantas' }),
        task({ id: 'd', title: 'Levar o lixo', due_on: '2026-11-02' }),
      ],
      today,
    )
    expect(groups.map((g) => g.key)).toEqual(['overdue', 'today', 'none'])
    expect(groups[1]!.tasks.map((t) => t.id)).toEqual(['b', 'a'])
  })

  it('descreve o prazo', () => {
    expect(dueLabel(today, today)).toBe('Hoje')
    expect(dueLabel('2026-11-05', today)).toBe('Amanhã')
    expect(dueLabel('2026-11-03', today)).toBe('Ontem')
    expect(dueLabel('2026-11-01', today)).toBe('Atrasada há 3 dias')
    expect(dueLabel('2026-12-25', today)).toBe('25/12/2026')
  })
})
