import { AppError, unwrap } from '@/lib/errors'
import { newId } from '@/lib/id'
import { supabase } from '@/lib/supabase'
import type { ListItem, ListSummary, Purchase, PurchaseItem, ShoppingList, Store } from './types'

export type ListPatch = Partial<Pick<ShoppingList, 'name' | 'description' | 'list_date' | 'budget' | 'status'>>

export async function fetchLists(familyId: string, status: 'active' | 'archived'): Promise<ShoppingList[]> {
  const rows = unwrap(
    await supabase
      .from('shopping_lists')
      .select('*')
      .eq('family_id', familyId)
      .eq('status', status)
      .order('is_featured', { ascending: false })
      .order(status === 'archived' ? 'archived_at' : 'updated_at', { ascending: false }),
  )
  return rows as ShoppingList[]
}

export async function fetchSummaries(familyId: string): Promise<ListSummary[]> {
  return unwrap(await supabase.from('shopping_list_summaries').select('*').eq('family_id', familyId)) as ListSummary[]
}

export async function fetchList(listId: string): Promise<ShoppingList | null> {
  return unwrap(await supabase.from('shopping_lists').select('*').eq('id', listId).maybeSingle()) as ShoppingList | null
}

export async function fetchItems(listId: string): Promise<ListItem[]> {
  const rows = unwrap(
    await supabase.from('list_items').select('*').eq('list_id', listId).order('created_at').order('id'),
  )
  return rows as ListItem[]
}

export async function createList(input: {
  familyId: string
  name: string
  description?: string | null
  listDate?: string | null
  budget?: string | null
}): Promise<ShoppingList> {
  const row = unwrap(
    await supabase
      .from('shopping_lists')
      .insert({
        id: newId(),
        family_id: input.familyId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        list_date: input.listDate || null,
        budget: input.budget ?? null,
      })
      .select()
      .single(),
  )
  return row as ShoppingList
}

export async function updateList(listId: string, patch: ListPatch): Promise<ShoppingList> {
  const rows = unwrap(await supabase.from('shopping_lists').update(patch).eq('id', listId).select()) as ShoppingList[]
  if (rows.length === 0) throw new AppError('Lista não encontrada. Ela pode ter sido excluída.', { hint: 'NOT_FOUND' })
  return rows[0]!
}

export async function deleteList(listId: string): Promise<void> {
  const rows = unwrap(await supabase.from('shopping_lists').delete().eq('id', listId).select('id'))
  if ((rows as unknown[]).length === 0) {
    throw new AppError('Somente quem criou a lista ou um administrador da família pode excluí-la.', { code: '42501' })
  }
}

export async function setFeaturedList(listId: string, featured: boolean): Promise<void> {
  unwrap(await supabase.rpc('set_featured_list', { p_list_id: listId, p_featured: featured }))
}

export async function duplicateList(listId: string, name: string): Promise<string> {
  return unwrap(await supabase.rpc('duplicate_shopping_list', { p_list_id: listId, p_name: name })) as string
}

export interface CompleteListInput {
  listId: string
  purchasedOn: string
  storeId: string | null
  paidTotal: string | null
  notes: string | null
  recordPrices: boolean
  saveToCatalog: boolean
  archive: boolean
}

export async function completeList(input: CompleteListInput): Promise<string> {
  return unwrap(
    await supabase.rpc('complete_shopping_list', {
      p_list_id: input.listId,
      p_purchased_on: input.purchasedOn,
      p_store_id: input.storeId,
      p_paid_total: input.paidTotal,
      p_notes: input.notes,
      p_record_prices: input.recordPrices,
      p_save_to_catalog: input.saveToCatalog,
      p_archive: input.archive,
    }),
  ) as string
}

// ---------------------------------------------------------------------------
// Estabelecimentos
// ---------------------------------------------------------------------------

export async function fetchStores(familyId: string): Promise<Store[]> {
  return unwrap(
    await supabase.from('stores').select('id, family_id, name').eq('family_id', familyId).order('name'),
  ) as Store[]
}

/** Cadastra um estabelecimento (ou devolve o existente com o mesmo nome). */
export async function ensureStore(familyId: string, name: string): Promise<Store> {
  const trimmed = name.trim()
  const { data, error } = await supabase
    .from('stores')
    .insert({ id: newId(), family_id: familyId, name: trimmed })
    .select('id, family_id, name')
    .single()
  if (!error) return data as Store
  if ((error as { code?: string }).code !== '23505') throw error
  const existing = (await fetchStores(familyId)).find(
    (s) => s.name.trim().toLocaleLowerCase('pt-BR') === trimmed.toLocaleLowerCase('pt-BR'),
  )
  if (!existing) throw new AppError('Não foi possível cadastrar o estabelecimento.')
  return existing
}

// ---------------------------------------------------------------------------
// Compras concluídas
// ---------------------------------------------------------------------------

export async function fetchPurchases(familyId: string): Promise<Purchase[]> {
  return unwrap(
    await supabase
      .from('purchases')
      .select('*')
      .eq('family_id', familyId)
      .order('purchased_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500),
  ) as Purchase[]
}

export async function fetchPurchase(purchaseId: string): Promise<Purchase | null> {
  return unwrap(await supabase.from('purchases').select('*').eq('id', purchaseId).maybeSingle()) as Purchase | null
}

export async function fetchPurchaseForList(listId: string): Promise<Purchase | null> {
  return unwrap(await supabase.from('purchases').select('*').eq('list_id', listId).maybeSingle()) as Purchase | null
}

export async function fetchPurchaseItems(purchaseId: string): Promise<PurchaseItem[]> {
  return unwrap(
    await supabase.from('purchase_items').select('*').eq('purchase_id', purchaseId).order('category').order('name'),
  ) as PurchaseItem[]
}

export async function updatePurchase(
  purchaseId: string,
  patch: Partial<Pick<Purchase, 'store_id' | 'purchased_on' | 'paid_total' | 'notes' | 'name'>>,
): Promise<void> {
  const rows = unwrap(await supabase.from('purchases').update(patch).eq('id', purchaseId).select('id'))
  if ((rows as unknown[]).length === 0) throw new AppError('Compra não encontrada.', { hint: 'NOT_FOUND' })
}

export async function deletePurchase(purchaseId: string): Promise<void> {
  const rows = unwrap(await supabase.from('purchases').delete().eq('id', purchaseId).select('id'))
  if ((rows as unknown[]).length === 0) {
    throw new AppError('Somente quem registrou a compra ou um administrador pode excluí-la.', { code: '42501' })
  }
}
