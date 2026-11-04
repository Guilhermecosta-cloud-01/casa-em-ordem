import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { todayIso } from '@/lib/format'
import { newId } from '@/lib/id'
import { usePollInterval, useTableRealtime } from '@/lib/realtime'
import { defineRowSync } from '@/lib/sync/rowSync'
import { useAuth } from '@/modules/auth/AuthProvider'
import { useActiveFamily } from '@/modules/family/FamilyProvider'
import * as api from './api'
import type { Task, TaskFields } from './types'

export const tasksKey = (familyId: string) => ['tasks', familyId] as const

export const taskSync = defineRowSync<Task>({
  kind: 'task',
  table: 'tasks',
  queryKey: tasksKey,
  toRow: (row, userId) =>
    ({
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
      created_by: userId,
      updated_by: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...row,
    }) as Task,
  custom: {
    complete: {
      send: (op) => api.completeTask(op.entityId),
      apply: (rows, op) =>
        rows.map((t) =>
          t.id === op.entityId
            ? { ...t, status: 'done' as const, completed_at: new Date().toISOString(), completed_by: op.userId }
            : t,
        ),
    },
    reopen: {
      send: (op) => api.reopenTask(op.entityId),
      apply: (rows, op) =>
        rows.map((t) => (t.id === op.entityId ? { ...t, status: 'open' as const, completed_at: null, completed_by: null } : t)),
    },
  },
})

export function useTasks() {
  const family = useActiveFamily()
  const queryClient = useQueryClient()
  const live = useTableRealtime({
    channel: `tasks:${family.id}`,
    tables: [{ table: 'tasks', filter: `family_id=eq.${family.id}` }],
    onChange: () => void queryClient.invalidateQueries({ queryKey: tasksKey(family.id) }),
    isMine: (id) => Boolean(queryClient.getQueryData<Task[]>(tasksKey(family.id))?.some((t) => t.id === id)),
  })
  const refetchInterval = usePollInterval(live)
  const query = useQuery({
    queryKey: tasksKey(family.id),
    queryFn: () => api.fetchTasks(family.id),
    refetchInterval,
  })
  const { rows, pendingIds } = taskSync.useRows(family.id, query.data)
  return { ...query, tasks: rows, pendingIds, offlineNoData: query.fetchStatus === 'paused' && query.data === undefined }
}

export function useTaskActions() {
  const family = useActiveFamily()
  const { user } = useAuth()
  const create = useCallback(
    (fields: TaskFields) => {
      const id = newId()
      taskSync.insert(family.id, { id, family_id: family.id, ...fields }, fields.title)
      return id
    },
    [family.id],
  )
  const update = useCallback(
    (task: Task, patch: Partial<TaskFields>) => taskSync.update(family.id, task.id, patch, task.title),
    [family.id],
  )
  const complete = useCallback((task: Task) => taskSync.custom('complete', family.id, task.id, {}, task.title), [family.id])
  const reopen = useCallback((task: Task) => taskSync.custom('reopen', family.id, task.id, {}, task.title), [family.id])
  const remove = useCallback((task: Task) => taskSync.remove(family.id, task.id, task.title), [family.id])
  return { create, update, complete, reopen, remove, userId: user?.id ?? null, today: todayIso() }
}
