import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo } from 'react'
import { useToast } from '@/components/ui/Toast'
import { env } from '@/lib/env'
import { errorMessage } from '@/lib/errors'
import { newId } from '@/lib/id'
import { useOnline, useOutbox } from '@/lib/sync/hooks'
import { useUser } from '@/modules/auth/AuthProvider'
import { useActiveFamily, useFamily } from '@/modules/family/FamilyProvider'
import * as api from './api'
import {
  applyPendingItemOps,
  itemsKey,
  listScope,
  type NewItemRow,
  queueAdjustItem,
  queueDeleteItem,
  queueInsertItem,
  queueUpdateItem,
} from './offline'
import { useListRealtime } from './realtime'
import type { ItemPatch, ListItem, ListSummary, ShoppingList } from './types'

export function useLists(status: 'active' | 'archived') {
  const family = useActiveFamily()
  return useQuery({
    queryKey: ['lists', family.id, status],
    queryFn: () => api.fetchLists(family.id, status),
  })
}

export function useSummaries() {
  const family = useActiveFamily()
  const query = useQuery({
    queryKey: ['summaries', family.id],
    queryFn: () => api.fetchSummaries(family.id),
  })
  const byList = useMemo(() => new Map((query.data ?? []).map((s) => [s.list_id, s] as const)), [query.data])
  return { ...query, byList } as typeof query & { byList: Map<string, ListSummary> }
}

export function useList(listId: string | undefined) {
  return useQuery({
    queryKey: ['list', listId],
    queryFn: () => api.fetchList(listId!),
    enabled: Boolean(listId),
  })
}

/**
 * Itens de uma lista: dados do servidor + alterações ainda pendentes na fila
 * (para a tela refletir na hora o que a pessoa fez, mesmo offline).
 */
export function useListItems(listId: string | undefined) {
  const live = useListRealtime(listId)
  const online = useOnline()
  const query = useQuery({
    queryKey: itemsKey(listId ?? ''),
    queryFn: () => api.fetchItems(listId!),
    enabled: Boolean(listId),
    // Sem Realtime, consulta periodicamente; sem internet, não adianta tentar.
    refetchInterval: live === 'live' || !online ? false : env.syncPollMs,
  })
  const { ensureMembers } = useFamily()
  useEffect(() => {
    const ids = new Set<string>()
    for (const item of query.data ?? []) {
      if (item.created_by) ids.add(item.created_by)
      if (item.updated_by) ids.add(item.updated_by)
      if (item.purchased_by) ids.add(item.purchased_by)
    }
    ensureMembers(ids)
  }, [query.data, ensureMembers])
  const outbox = useOutbox()
  const ops = useMemo(
    () => (listId ? outbox.ops.filter((op) => op.scope === listScope(listId)) : []),
    [outbox.ops, listId],
  )
  const items = useMemo(() => applyPendingItemOps(query.data ?? [], ops), [query.data, ops])
  const pendingIds = useMemo(() => new Set(ops.map((op) => op.entityId)), [ops])
  return { ...query, items, pendingIds, live }
}

/** Ações sobre itens. Funcionam offline: entram na fila e sobem quando possível. */
export function useItemActions(list: Pick<ShoppingList, 'id' | 'family_id'>) {
  const toast = useToast()
  const user = useUser()

  const add = useCallback(
    (fields: Omit<NewItemRow, 'id' | 'family_id' | 'list_id'>) => {
      const row: NewItemRow = { ...fields, id: newId(), family_id: list.family_id, list_id: list.id }
      try {
        queueInsertItem(row)
      } catch (e) {
        toast.error(errorMessage(e))
      }
      return row.id
    },
    [list.family_id, list.id, toast],
  )

  const update = useCallback(
    (item: ListItem, patch: ItemPatch) => {
      try {
        queueUpdateItem(item, patch)
      } catch (e) {
        toast.error(errorMessage(e))
      }
    },
    [toast],
  )

  const adjust = useCallback(
    (item: ListItem, delta: number) => {
      try {
        queueAdjustItem(item, delta)
      } catch (e) {
        toast.error(errorMessage(e))
      }
    },
    [toast],
  )

  const remove = useCallback(
    (item: ListItem) => {
      try {
        queueDeleteItem(item)
        toast.info(`${item.name} removido da lista.`, {
          label: 'Desfazer',
          onClick: () =>
            queueInsertItem({
              id: newId(),
              family_id: item.family_id,
              list_id: item.list_id,
              product_id: item.product_id,
              name: item.name,
              category: item.category,
              brand: item.brand,
              packages: item.packages,
              quantity: item.quantity,
              unit: item.unit,
              unit_price: item.unit_price,
              price_basis: item.price_basis,
              notes: item.notes,
              is_purchased: item.is_purchased,
            }),
        })
      } catch (e) {
        toast.error(errorMessage(e))
      }
    },
    [toast],
  )

  const togglePurchased = useCallback(
    (item: ListItem) => update(item, { is_purchased: !item.is_purchased }),
    [update],
  )

  return { add, update, adjust, remove, togglePurchased, userId: user.id }
}

// ---------------------------------------------------------------------------
// Mutações de listas (precisam de conexão)
// ---------------------------------------------------------------------------

function useInvalidateLists() {
  const queryClient = useQueryClient()
  return useCallback(
    (listId?: string) => {
      void queryClient.invalidateQueries({ queryKey: ['lists'] })
      void queryClient.invalidateQueries({ queryKey: ['summaries'] })
      if (listId) void queryClient.invalidateQueries({ queryKey: ['list', listId] })
    },
    [queryClient],
  )
}

export function useListMutations() {
  const queryClient = useQueryClient()
  const invalidate = useInvalidateLists()
  const toast = useToast()
  const onError = (error: unknown) => toast.error(errorMessage(error))

  const create = useMutation({ mutationFn: api.createList, onSuccess: () => invalidate(), onError })
  const update = useMutation({
    mutationFn: ({ listId, patch }: { listId: string; patch: api.ListPatch }) => api.updateList(listId, patch),
    onSuccess: (row) => {
      queryClient.setQueryData(['list', row.id], row)
      invalidate(row.id)
    },
    onError,
  })
  const remove = useMutation({
    mutationFn: api.deleteList,
    onSuccess: (_d, listId) => {
      queryClient.removeQueries({ queryKey: ['list', listId] })
      invalidate()
    },
    onError,
  })
  const feature = useMutation({
    mutationFn: ({ listId, featured }: { listId: string; featured: boolean }) => api.setFeaturedList(listId, featured),
    onSuccess: (_d, vars) => invalidate(vars.listId),
    onError,
  })
  const duplicate = useMutation({
    mutationFn: ({ listId, name }: { listId: string; name: string }) => api.duplicateList(listId, name),
    onSuccess: () => invalidate(),
    onError,
  })
  const complete = useMutation({
    mutationFn: api.completeList,
    onSuccess: (_d, vars) => {
      invalidate(vars.listId)
      void queryClient.invalidateQueries({ queryKey: itemsKey(vars.listId) })
      void queryClient.invalidateQueries({ queryKey: ['purchases'] })
      void queryClient.invalidateQueries({ queryKey: ['list-purchase', vars.listId] })
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      void queryClient.invalidateQueries({ queryKey: ['product-stats'] })
    },
    onError,
  })
  return { create, update, remove, feature, duplicate, complete }
}

export function useStores() {
  const family = useActiveFamily()
  return useQuery({ queryKey: ['stores', family.id], queryFn: () => api.fetchStores(family.id), staleTime: 5 * 60_000 })
}

export function usePurchases() {
  const family = useActiveFamily()
  return useQuery({ queryKey: ['purchases', family.id], queryFn: () => api.fetchPurchases(family.id) })
}

export function useListPurchase(listId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['list-purchase', listId],
    queryFn: () => api.fetchPurchaseForList(listId!),
    enabled: Boolean(listId) && enabled,
  })
}
