// Operações de itens que funcionam sem internet (via fila de sincronização).
import { Big, toBig } from '@/lib/decimal'
import { AppError, unwrap } from '@/lib/errors'
import { queryClient } from '@/lib/queryClient'
import { configureOutbox, enqueue, type QueuedOp } from '@/lib/sync/outbox'
import { supabase } from '@/lib/supabase'
import type { ItemPatch, ListItem } from './types'

export const ITEM_INSERT = 'item.insert'
export const ITEM_UPDATE = 'item.update'
export const ITEM_ADJUST = 'item.adjust'
export const ITEM_DELETE = 'item.delete'

/** Linha enviada na inclusão (o id é gerado no aparelho). */
export type NewItemRow = Pick<
  ListItem,
  | 'id'
  | 'family_id'
  | 'list_id'
  | 'product_id'
  | 'name'
  | 'category'
  | 'brand'
  | 'packages'
  | 'quantity'
  | 'unit'
  | 'unit_price'
  | 'price_basis'
  | 'notes'
  | 'is_purchased'
>

interface InsertPayload {
  listId: string
  item: NewItemRow
}
interface UpdatePayload {
  listId: string
  patch: ItemPatch
}
interface AdjustPayload {
  listId: string
  delta: number
}
interface DeletePayload {
  listId: string
}

export const itemsKey = (listId: string) => ['items', listId] as const
export const listScope = (listId: string) => `list:${listId}`

function setCachedItems(listId: string, update: (items: ListItem[]) => ListItem[]) {
  queryClient.setQueryData<ListItem[]>(itemsKey(listId), (old) => (old ? update(old) : old))
}

function upsert(items: ListItem[], row: ListItem): ListItem[] {
  const index = items.findIndex((i) => i.id === row.id)
  if (index === -1) return [...items, row]
  const copy = [...items]
  copy[index] = row
  return copy
}

/** Monta um item completo para exibir antes da confirmação do servidor. */
export function optimisticItem(row: NewItemRow, userId: string): ListItem {
  const now = new Date().toISOString()
  return {
    ...row,
    purchased_at: row.is_purchased ? now : null,
    purchased_by: row.is_purchased ? userId : null,
    created_by: userId,
    updated_by: userId,
    created_at: now,
    updated_at: now,
  }
}

function applyPatch(item: ListItem, patch: ItemPatch, userId: string): ListItem {
  const now = new Date().toISOString()
  const next: ListItem = { ...item, ...patch, updated_at: now, updated_by: userId }
  if (patch.is_purchased !== undefined && patch.is_purchased !== item.is_purchased) {
    next.purchased_at = patch.is_purchased ? now : null
    next.purchased_by = patch.is_purchased ? userId : null
  }
  return next
}

function addPackages(packages: number | string, delta: number): number | string {
  const next = toBig(packages).plus(delta)
  return next.gt(0) && next.lte(9999) ? next.toString() : packages
}

/**
 * Sobrepõe as alterações ainda não confirmadas aos dados do servidor, para
 * a tela mostrar o que a pessoa fez, mesmo offline.
 */
export function applyPendingItemOps(items: ListItem[], ops: readonly QueuedOp[]): ListItem[] {
  let result = items
  for (const op of ops) {
    switch (op.type) {
      case ITEM_INSERT: {
        const payload = op.payload as InsertPayload
        if (!result.some((i) => i.id === op.entityId)) result = [...result, optimisticItem(payload.item, op.userId)]
        break
      }
      case ITEM_UPDATE: {
        const { patch } = op.payload as UpdatePayload
        result = result.map((i) => (i.id === op.entityId ? applyPatch(i, patch, op.userId) : i))
        break
      }
      case ITEM_ADJUST: {
        const { delta } = op.payload as AdjustPayload
        result = result.map((i) => (i.id === op.entityId ? { ...i, packages: addPackages(i.packages, delta) } : i))
        break
      }
      case ITEM_DELETE:
        result = result.filter((i) => i.id !== op.entityId)
        break
    }
  }
  return result
}

/**
 * Junta alterações redundantes antes de enviar:
 *   editar um item que ainda não subiu → entra na própria inclusão;
 *   vários "+" seguidos → um ajuste só;
 *   excluir um item que nunca chegou ao servidor → nada a enviar.
 * Operações já em envio nunca são alteradas.
 */
export function coalesceItemOps(queue: QueuedOp[], incoming: QueuedOp): QueuedOp[] {
  if (!incoming.type.startsWith('item.')) return [...queue, incoming]
  const sameEntity = queue.filter((o) => o.entityId === incoming.entityId && o.userId === incoming.userId)
  const last = sameEntity[sameEntity.length - 1]
  const replace = (op: QueuedOp) => queue.map((o) => (o.opId === op.opId ? op : o))

  if (incoming.type === ITEM_DELETE) {
    const anySending = sameEntity.some((o) => o.status === 'sending')
    const pendingInsert = sameEntity.some((o) => o.type === ITEM_INSERT && o.status === 'pending')
    if (pendingInsert && !anySending) {
      return queue.filter((o) => !(o.entityId === incoming.entityId && o.userId === incoming.userId))
    }
    const kept = queue.filter(
      (o) =>
        !(
          o.entityId === incoming.entityId &&
          o.userId === incoming.userId &&
          o.status === 'pending' &&
          (o.type === ITEM_UPDATE || o.type === ITEM_ADJUST)
        ),
    )
    return [...kept, incoming]
  }

  if (!last || last.status !== 'pending') return [...queue, incoming]

  if (incoming.type === ITEM_UPDATE) {
    const { patch } = incoming.payload as UpdatePayload
    if (last.type === ITEM_INSERT) {
      const payload = last.payload as InsertPayload
      return replace({ ...last, label: incoming.label, payload: { ...payload, item: { ...payload.item, ...patch } } })
    }
    if (last.type === ITEM_UPDATE) {
      const payload = last.payload as UpdatePayload
      return replace({ ...last, label: incoming.label, payload: { ...payload, patch: { ...payload.patch, ...patch } } })
    }
  }

  if (incoming.type === ITEM_ADJUST) {
    const { delta } = incoming.payload as AdjustPayload
    if (last.type === ITEM_INSERT) {
      const payload = last.payload as InsertPayload
      return replace({
        ...last,
        payload: { ...payload, item: { ...payload.item, packages: addPackages(payload.item.packages, delta) } },
      })
    }
    if (last.type === ITEM_ADJUST) {
      const payload = last.payload as AdjustPayload
      const sum = payload.delta + delta
      if (sum === 0) return queue.filter((o) => o.opId !== last.opId)
      return replace({ ...last, payload: { ...payload, delta: sum } })
    }
  }

  return [...queue, incoming]
}

// ---------------------------------------------------------------------------
// Ações usadas pela interface
// ---------------------------------------------------------------------------

export function queueInsertItem(row: NewItemRow) {
  enqueue<InsertPayload>({
    type: ITEM_INSERT,
    scope: listScope(row.list_id),
    entityId: row.id,
    payload: { listId: row.list_id, item: row },
    label: row.name,
  })
}

export function queueUpdateItem(item: Pick<ListItem, 'id' | 'list_id' | 'name'>, patch: ItemPatch) {
  if (Object.keys(patch).length === 0) return
  enqueue<UpdatePayload>({
    type: ITEM_UPDATE,
    scope: listScope(item.list_id),
    entityId: item.id,
    payload: { listId: item.list_id, patch },
    label: patch.name ?? item.name,
  })
}

export function queueAdjustItem(item: Pick<ListItem, 'id' | 'list_id' | 'name'>, delta: number) {
  enqueue<AdjustPayload>({
    type: ITEM_ADJUST,
    scope: listScope(item.list_id),
    entityId: item.id,
    payload: { listId: item.list_id, delta },
    label: item.name,
  })
}

export function queueDeleteItem(item: Pick<ListItem, 'id' | 'list_id' | 'name'>) {
  enqueue<DeletePayload>({
    type: ITEM_DELETE,
    scope: listScope(item.list_id),
    entityId: item.id,
    payload: { listId: item.list_id },
    label: item.name,
  })
}

// ---------------------------------------------------------------------------
// Envio ao servidor
// ---------------------------------------------------------------------------

const handlers = {
  [ITEM_INSERT]: {
    async send(op: QueuedOp<InsertPayload>) {
      const { data, error } = await supabase.from('list_items').insert(op.payload.item).select().single()
      if (error) throw error
      return data as ListItem
    },
    // O mesmo id já existe: a inclusão chegou antes e só a resposta se perdeu.
    isAlreadyApplied: (error: unknown) => (error as { code?: string })?.code === '23505',
    onSuccess(op: QueuedOp<InsertPayload>, row: ListItem | null) {
      setCachedItems(op.payload.listId, (items) => upsert(items, row ?? optimisticItem(op.payload.item, op.userId)))
    },
  },
  [ITEM_UPDATE]: {
    async send(op: QueuedOp<UpdatePayload>) {
      const rows = unwrap(
        await supabase.from('list_items').update(op.payload.patch).eq('id', op.entityId).select(),
      ) as ListItem[]
      if (rows.length === 0) {
        throw new AppError(`"${op.label}" foi removido da lista por outra pessoa.`, { hint: 'NOT_FOUND' })
      }
      return rows[0]!
    },
    onSuccess(op: QueuedOp<UpdatePayload>, row: ListItem) {
      setCachedItems(op.payload.listId, (items) => upsert(items, row))
    },
  },
  [ITEM_ADJUST]: {
    async send(op: QueuedOp<AdjustPayload>) {
      const packages = unwrap(
        await supabase.rpc('adjust_list_item_packages', {
          p_item_id: op.entityId,
          p_delta: op.payload.delta,
          p_op_id: op.opId,
        }),
      ) as number
      return packages
    },
    onSuccess(op: QueuedOp<AdjustPayload>, packages: number) {
      setCachedItems(op.payload.listId, (items) =>
        items.map((i) => (i.id === op.entityId ? { ...i, packages: new Big(packages).toString() } : i)),
      )
    },
  },
  [ITEM_DELETE]: {
    async send(op: QueuedOp<DeletePayload>) {
      unwrap(await supabase.from('list_items').delete().eq('id', op.entityId))
      return null
    },
    onSuccess(op: QueuedOp<DeletePayload>) {
      setCachedItems(op.payload.listId, (items) => items.filter((i) => i.id !== op.entityId))
    },
  },
}

export function setupShoppingSync(options: {
  refreshAuth: () => Promise<boolean>
  onFailure: (message: string) => void
}) {
  configureOutbox({
    handlers,
    coalesce: coalesceItemOps,
    refreshAuth: options.refreshAuth,
    onFailure: (failed) => options.onFailure(failed.message),
    onSettled: (scopes) => {
      for (const scope of scopes) {
        if (scope.startsWith('list:')) {
          const listId = scope.slice('list:'.length)
          void queryClient.invalidateQueries({ queryKey: itemsKey(listId) })
          void queryClient.invalidateQueries({ queryKey: ['summaries'] })
        }
      }
    },
  })
}
