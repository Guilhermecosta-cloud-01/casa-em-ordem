import type { QueryKey } from '@tanstack/react-query'
import { useMemo } from 'react'
import { AppError, unwrap } from '../errors'
import { queryClient } from '../queryClient'
import { supabase } from '../supabase'
import { useOutbox } from './hooks'
import { enqueue, type OpHandler, type QueuedOp, registerOpHandlers } from './outbox'

/**
 * Inclusão, alteração e exclusão de linhas de uma tabela da família pela
 * fila de sincronização: funcionam sem internet, aparecem na tela na hora
 * (marcadas como pendentes) e só saem da fila depois que o servidor
 * confirma. Operações especiais (ex.: concluir tarefa) entram em `custom`.
 */
export interface RowPayload {
  familyId: string
  row?: Record<string, unknown>
  patch?: Record<string, unknown>
  args?: Record<string, unknown>
}

export interface CustomOp<T> {
  send: (op: QueuedOp<RowPayload>) => Promise<unknown>
  /** Como a operação aparece na tela antes da confirmação. */
  apply?: (rows: T[], op: QueuedOp<RowPayload>) => T[]
  isAlreadyApplied?: (error: unknown) => boolean
}

export function defineRowSync<T extends { id: string }>(def: {
  kind: string
  table: string
  queryKey: (familyId: string) => QueryKey
  /** Linha completa (para a tela) a partir do que foi enviado. */
  toRow: (row: Record<string, unknown>, userId: string) => T
  custom?: Record<string, CustomOp<T>>
  alsoInvalidate?: (familyId: string) => QueryKey[]
}) {
  const types = { insert: `${def.kind}.insert`, update: `${def.kind}.update`, delete: `${def.kind}.delete` }
  const scope = (familyId: string) => `${def.kind}:${familyId}`
  const customType = (name: string) => `${def.kind}.${name}`

  const handlers: Record<string, OpHandler<RowPayload>> = {
    [types.insert]: {
      send: async (op) => {
        unwrap(await supabase.from(def.table).insert(op.payload.row!))
      },
      isAlreadyApplied: (error) => (error as { code?: string } | null)?.code === '23505',
    },
    [types.update]: {
      send: async (op) => {
        const rows = unwrap(
          await supabase.from(def.table).update(op.payload.patch!).eq('id', op.entityId).select('id'),
        ) as unknown[]
        if (rows.length === 0) throw new AppError('Este registro não existe mais.', { hint: 'NOT_FOUND' })
      },
    },
    [types.delete]: {
      send: async (op) => {
        unwrap(await supabase.from(def.table).delete().eq('id', op.entityId))
      },
    },
  }
  for (const [name, custom] of Object.entries(def.custom ?? {})) {
    handlers[customType(name)] = { send: custom.send, isAlreadyApplied: custom.isAlreadyApplied }
  }

  function apply(rows: T[], ops: readonly QueuedOp[], familyId: string): T[] {
    let result = rows
    for (const op of ops) {
      if (op.scope !== scope(familyId)) continue
      const payload = op.payload as RowPayload
      if (op.type === types.insert) {
        if (!result.some((r) => r.id === op.entityId)) result = [...result, def.toRow(payload.row!, op.userId)]
      } else if (op.type === types.update) {
        result = result.map((r) => (r.id === op.entityId ? { ...r, ...payload.patch } : r))
      } else if (op.type === types.delete) {
        result = result.filter((r) => r.id !== op.entityId)
      } else {
        const custom = def.custom?.[op.type.slice(def.kind.length + 1)]
        if (custom?.apply) result = custom.apply(result, op as QueuedOp<RowPayload>)
      }
    }
    return result
  }

  function register() {
    registerOpHandlers(handlers, {
      onSettled: (scopes) => {
        for (const s of scopes) {
          if (!s.startsWith(`${def.kind}:`)) continue
          const familyId = s.slice(def.kind.length + 1)
          void queryClient.invalidateQueries({ queryKey: def.queryKey(familyId) })
          for (const key of def.alsoInvalidate?.(familyId) ?? []) void queryClient.invalidateQueries({ queryKey: key })
        }
      },
    })
  }

  /** Linhas do servidor + o que ainda está na fila; e os ids pendentes. */
  function useRows(familyId: string, serverRows: T[] | undefined) {
    const { ops } = useOutbox()
    return useMemo(() => {
      const mine = ops.filter((op) => op.scope === scope(familyId))
      // Sem nada carregado (ex.: offline num aparelho sem cache), o que foi
      // feito agora ainda aparece.
      const base = serverRows ?? (mine.some((op) => op.type === types.insert) ? [] : undefined)
      return {
        rows: base ? apply(base, mine, familyId) : undefined,
        pendingIds: new Set(mine.map((op) => op.entityId)),
      }
    }, [ops, serverRows, familyId])
  }

  return {
    types,
    scope,
    apply,
    register,
    useRows,
    insert: (familyId: string, row: Record<string, unknown> & { id: string }, label: string) =>
      enqueue<RowPayload>({ type: types.insert, scope: scope(familyId), entityId: row.id, payload: { familyId, row }, label }),
    update: (familyId: string, id: string, patch: Record<string, unknown>, label: string) =>
      enqueue<RowPayload>({ type: types.update, scope: scope(familyId), entityId: id, payload: { familyId, patch }, label }),
    remove: (familyId: string, id: string, label: string) =>
      enqueue<RowPayload>({ type: types.delete, scope: scope(familyId), entityId: id, payload: { familyId }, label }),
    custom: (name: string, familyId: string, id: string, args: Record<string, unknown>, label: string) =>
      enqueue<RowPayload>({ type: customType(name), scope: scope(familyId), entityId: id, payload: { familyId, args }, label }),
  }
}
