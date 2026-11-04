// Criar lista sem internet: a lista aparece na hora (com itens também feitos
// offline) e é enviada ao servidor antes deles, quando a conexão voltar.
import { unwrap } from '@/lib/errors'
import { queryClient } from '@/lib/queryClient'
import { supabase } from '@/lib/supabase'
import { enqueue, getOutboxSnapshot, registerOpHandlers } from '@/lib/sync/outbox'
import { itemsKey } from './offline'
import type { ShoppingList } from './types'

export const LIST_INSERT = 'list.insert'

interface ListRow {
  id: string
  family_id: string
  name: string
  description: string | null
  list_date: string | null
  budget: string | null
}

export function registerListSync() {
  registerOpHandlers(
    {
      [LIST_INSERT]: {
        send: async (op) => {
          unwrap(await supabase.from('shopping_lists').insert((op.payload as { row: ListRow }).row))
        },
        isAlreadyApplied: (error) => (error as { code?: string } | null)?.code === '23505',
      },
    },
    {
      onSettled: (scopes) => {
        for (const scope of scopes) {
          if (!scope.startsWith('lists:')) continue
          void queryClient.invalidateQueries({ queryKey: ['lists'] })
          void queryClient.invalidateQueries({ queryKey: ['summaries'] })
        }
      },
    },
  )
}

/** Guarda a nova lista na fila e no cache local; devolve a linha para a tela. */
export function queueCreateList(row: ListRow, userId: string | null): ShoppingList {
  const now = new Date().toISOString()
  const list: ShoppingList = {
    ...row,
    status: 'active',
    is_featured: false,
    completed_at: null,
    archived_at: null,
    created_by: userId,
    updated_by: userId,
    created_at: now,
    updated_at: now,
  }
  enqueue({ type: LIST_INSERT, scope: `lists:${row.family_id}`, entityId: row.id, payload: { row }, label: row.name })
  queryClient.setQueryData(['list', row.id], list)
  queryClient.setQueryData(itemsKey(row.id), [])
  queryClient.setQueryData<ShoppingList[]>(['lists', row.family_id, 'active'], (prev) => [list, ...(prev ?? [])])
  return list
}

/** Lista criada sem internet que ainda não chegou ao servidor. */
export function isListPending(listId: string): boolean {
  return getOutboxSnapshot().ops.some((op) => op.type === LIST_INSERT && op.entityId === listId)
}
