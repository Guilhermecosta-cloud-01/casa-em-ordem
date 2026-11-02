import { describe, expect, it } from 'vitest'
import type { QueuedOp } from '@/lib/sync/outbox'
import {
  applyPendingItemOps,
  coalesceItemOps,
  ITEM_ADJUST,
  ITEM_DELETE,
  ITEM_INSERT,
  ITEM_UPDATE,
  type NewItemRow,
  optimisticItem,
} from './offline'
import type { ListItem } from './types'

const USER = 'user-1'
let seq = 0

function op(type: string, entityId: string, payload: unknown, status: 'pending' | 'sending' = 'pending'): QueuedOp {
  seq += 1
  return {
    opId: `op-${seq}`,
    type,
    userId: USER,
    scope: 'list:L1',
    entityId,
    payload,
    label: 'Item',
    createdAt: seq,
    attempts: 0,
    status,
  }
}

function row(id: string, extra: Partial<NewItemRow> = {}): NewItemRow {
  return {
    id,
    family_id: 'F1',
    list_id: 'L1',
    product_id: null,
    name: 'Arroz',
    category: 'mercearia',
    brand: null,
    packages: 1,
    quantity: 5,
    unit: 'kg',
    unit_price: 25.9,
    price_basis: 'package',
    notes: null,
    is_purchased: false,
    ...extra,
  }
}

function serverItem(id: string, extra: Partial<ListItem> = {}): ListItem {
  return { ...optimisticItem(row(id), 'user-2'), ...extra }
}

function coalesceAll(ops: QueuedOp[]): QueuedOp[] {
  return ops.reduce<QueuedOp[]>((queue, next) => coalesceItemOps(queue, next), [])
}

describe('fila offline: junção de alterações', () => {
  it('editar um item que ainda não subiu altera a própria inclusão', () => {
    const queue = coalesceAll([
      op(ITEM_INSERT, 'i1', { listId: 'L1', item: row('i1') }),
      op(ITEM_UPDATE, 'i1', { listId: 'L1', patch: { unit_price: 27.5 } }),
      op(ITEM_ADJUST, 'i1', { listId: 'L1', delta: 2 }),
    ])
    expect(queue).toHaveLength(1)
    const item = (queue[0]!.payload as { item: NewItemRow }).item
    expect(item.unit_price).toBe(27.5)
    expect(String(item.packages)).toBe('3')
  })

  it('vários "+" viram um ajuste só; "+" e "−" se anulam', () => {
    const summed = coalesceAll([
      op(ITEM_ADJUST, 'i1', { listId: 'L1', delta: 1 }),
      op(ITEM_ADJUST, 'i1', { listId: 'L1', delta: 1 }),
      op(ITEM_ADJUST, 'i1', { listId: 'L1', delta: 1 }),
    ])
    expect(summed).toHaveLength(1)
    expect((summed[0]!.payload as { delta: number }).delta).toBe(3)
    const cancelled = coalesceAll([
      op(ITEM_ADJUST, 'i1', { listId: 'L1', delta: 1 }),
      op(ITEM_ADJUST, 'i1', { listId: 'L1', delta: -1 }),
    ])
    expect(cancelled).toHaveLength(0)
  })

  it('excluir item que nunca chegou ao servidor não envia nada', () => {
    const queue = coalesceAll([
      op(ITEM_INSERT, 'i1', { listId: 'L1', item: row('i1') }),
      op(ITEM_UPDATE, 'i1', { listId: 'L1', patch: { notes: 'x' } }),
      op(ITEM_DELETE, 'i1', { listId: 'L1' }),
    ])
    expect(queue).toHaveLength(0)
  })

  it('excluir item existente descarta edições pendentes dele e mantém as de outros', () => {
    const queue = coalesceAll([
      op(ITEM_UPDATE, 'i1', { listId: 'L1', patch: { notes: 'x' } }),
      op(ITEM_UPDATE, 'i2', { listId: 'L1', patch: { notes: 'y' } }),
      op(ITEM_DELETE, 'i1', { listId: 'L1' }),
    ])
    expect(queue.map((o) => `${o.type}:${o.entityId}`)).toEqual([`${ITEM_UPDATE}:i2`, `${ITEM_DELETE}:i1`])
  })

  it('nunca mexe em operação que já está sendo enviada', () => {
    const sending = op(ITEM_UPDATE, 'i1', { listId: 'L1', patch: { notes: 'a' } }, 'sending')
    const queue = coalesceItemOps([sending], op(ITEM_UPDATE, 'i1', { listId: 'L1', patch: { notes: 'b' } }))
    expect(queue).toHaveLength(2)
    expect((queue[0]!.payload as { patch: { notes: string } }).patch.notes).toBe('a')
  })
})

describe('fila offline: o que aparece na tela', () => {
  it('mostra inclusões, edições, ajustes e exclusões ainda não confirmadas', () => {
    const server = [serverItem('a'), serverItem('b', { name: 'Feijão', packages: 2 })]
    const ops = [
      op(ITEM_INSERT, 'c', { listId: 'L1', item: row('c', { name: 'Café' }) }),
      op(ITEM_UPDATE, 'a', { listId: 'L1', patch: { is_purchased: true } }),
      op(ITEM_ADJUST, 'b', { listId: 'L1', delta: 1 }),
      op(ITEM_DELETE, 'a', { listId: 'L1' }),
    ]
    const view = applyPendingItemOps(server, ops)
    expect(view.map((i) => i.name)).toEqual(['Feijão', 'Café'])
    expect(String(view[0]!.packages)).toBe('3')
  })

  it('marcar como comprado registra quem e quando, localmente', () => {
    const view = applyPendingItemOps([serverItem('a')], [op(ITEM_UPDATE, 'a', { listId: 'L1', patch: { is_purchased: true } })])
    expect(view[0]!.is_purchased).toBe(true)
    expect(view[0]!.purchased_by).toBe(USER)
    expect(view[0]!.purchased_at).not.toBeNull()
  })

  it('não duplica item cuja inclusão já chegou ao servidor', () => {
    const view = applyPendingItemOps([serverItem('c')], [op(ITEM_INSERT, 'c', { listId: 'L1', item: row('c') })])
    expect(view).toHaveLength(1)
  })

  it('ajuste nunca deixa a quantidade em zero', () => {
    const view = applyPendingItemOps([serverItem('a', { packages: 1 })], [op(ITEM_ADJUST, 'a', { listId: 'L1', delta: -1 })])
    expect(String(view[0]!.packages)).toBe('1')
  })
})
