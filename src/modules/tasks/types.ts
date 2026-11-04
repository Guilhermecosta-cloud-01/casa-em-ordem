import type { Recurrence } from '@/lib/recurrence'

export type TaskPriority = 'low' | 'normal' | 'high'

export interface Task {
  id: string
  family_id: string
  title: string
  notes: string | null
  assignee_id: string | null
  due_on: string | null
  priority: TaskPriority
  recurrence: Recurrence
  recurrence_interval: number
  status: 'open' | 'done'
  completed_at: string | null
  completed_by: string | null
  next_task_id: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export type TaskFields = Pick<
  Task,
  'title' | 'notes' | 'assignee_id' | 'due_on' | 'priority' | 'recurrence' | 'recurrence_interval'
>

export type NewTaskRow = TaskFields & Pick<Task, 'id' | 'family_id'>
