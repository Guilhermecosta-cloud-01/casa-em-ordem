import { addDays } from '@/lib/dates'
import { AppError, unwrap } from '@/lib/errors'
import { todayIso } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { NewTaskRow, Task, TaskFields } from './types'

/** Abertas + concluídas nos últimos 6 meses (o histórico). */
export async function fetchTasks(familyId: string): Promise<Task[]> {
  const since = `${addDays(todayIso(), -183)}T00:00:00Z`
  return unwrap(
    await supabase
      .from('tasks')
      .select('*')
      .eq('family_id', familyId)
      .or(`status.eq.open,completed_at.gte.${since}`)
      .order('due_on', { ascending: true, nullsFirst: false })
      .limit(1000),
  ) as Task[]
}

export async function insertTask(row: NewTaskRow): Promise<void> {
  unwrap(await supabase.from('tasks').insert(row))
}

export async function updateTask(id: string, patch: Partial<TaskFields>): Promise<void> {
  const rows = unwrap(await supabase.from('tasks').update(patch).eq('id', id).select('id')) as { id: string }[]
  if (rows.length === 0) throw new AppError('Esta tarefa não existe mais.', { hint: 'NOT_FOUND' })
}

export async function completeTask(id: string): Promise<string | null> {
  return unwrap(await supabase.rpc('complete_task', { p_task_id: id })) as string | null
}

export async function reopenTask(id: string): Promise<void> {
  unwrap(await supabase.rpc('reopen_task', { p_task_id: id }))
}

export async function deleteTask(id: string): Promise<void> {
  unwrap(await supabase.from('tasks').delete().eq('id', id))
}
