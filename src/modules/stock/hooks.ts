import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { toBig } from '@/lib/decimal'
import { unwrap } from '@/lib/errors'
import { newId } from '@/lib/id'
import { usePollInterval, useTableRealtime } from '@/lib/realtime'
import { supabase } from '@/lib/supabase'
import { defineRowSync } from '@/lib/sync/rowSync'
import { useActiveFamily } from '@/modules/family/FamilyProvider'
import { applyDelta, isLow } from './domain'
import type { StockFields, StockItem } from './types'

export const stockKey = (familyId: string) => ['stock', familyId] as const

async function fetchStock(familyId: string): Promise<StockItem[]> {
  return unwrap(await supabase.from('stock_items').select('*').eq('family_id', familyId).order('name')) as StockItem[]
}

function withLow(item: StockItem): StockItem {
  const min = item.min_quantity === null || item.min_quantity === '' ? null : toBig(item.min_quantity)
  return { ...item, is_low: isLow(toBig(item.quantity), min) }
}

export const stockSync = defineRowSync<StockItem>({
  kind: 'stock',
  table: 'stock_items',
  queryKey: stockKey,
  toRow: (row, userId) =>
    withLow({
      product_id: null,
      category: 'outros',
      unit: 'un',
      quantity: 0,
      min_quantity: null,
      location: null,
      notes: null,
      is_low: false,
      created_by: userId,
      updated_by: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...row,
    } as StockItem),
  custom: {
    adjust: {
      // O id da operação evita somar duas vezes se o envio for repetido.
      send: async (op) => {
        unwrap(
          await supabase.rpc('adjust_stock_quantity', {
            p_item_id: op.entityId,
            p_delta: op.payload.args!.delta,
            p_op_id: op.opId,
          }),
        )
      },
      apply: (rows, op) =>
        rows.map((item) =>
          item.id === op.entityId ? withLow({ ...item, quantity: applyDelta(item.quantity, op.payload.args!.delta as number) }) : item,
        ),
    },
  },
})

export function useStock() {
  const family = useActiveFamily()
  const queryClient = useQueryClient()
  const live = useTableRealtime({
    channel: `stock:${family.id}`,
    tables: [{ table: 'stock_items', filter: `family_id=eq.${family.id}` }],
    onChange: () => void queryClient.invalidateQueries({ queryKey: stockKey(family.id) }),
    isMine: (id) => Boolean(queryClient.getQueryData<StockItem[]>(stockKey(family.id))?.some((s) => s.id === id)),
  })
  const refetchInterval = usePollInterval(live)
  const query = useQuery({ queryKey: stockKey(family.id), queryFn: () => fetchStock(family.id), refetchInterval })
  const { rows, pendingIds } = stockSync.useRows(family.id, query.data)
  return { ...query, items: rows?.map(withLow), pendingIds }
}

export function useStockActions() {
  const family = useActiveFamily()
  const create = useCallback(
    (fields: StockFields) => {
      const id = newId()
      stockSync.insert(family.id, { id, family_id: family.id, ...fields }, fields.name)
      return id
    },
    [family.id],
  )
  const update = useCallback(
    (item: StockItem, patch: Partial<StockFields>) => stockSync.update(family.id, item.id, patch, item.name),
    [family.id],
  )
  const adjust = useCallback(
    (item: StockItem, delta: number) => stockSync.custom('adjust', family.id, item.id, { delta }, item.name),
    [family.id],
  )
  const remove = useCallback((item: StockItem) => stockSync.remove(family.id, item.id, item.name), [family.id])
  return { create, update, adjust, remove }
}

export async function addPurchaseToStock(purchaseId: string): Promise<number> {
  return unwrap(await supabase.rpc('add_purchase_to_stock', { p_purchase_id: purchaseId })) as number
}
