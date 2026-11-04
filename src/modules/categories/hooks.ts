import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { unwrap } from '@/lib/errors'
import { newId } from '@/lib/id'
import { supabase } from '@/lib/supabase'
import { useActiveFamily } from '@/modules/family/FamilyProvider'

export interface CustomCategory {
  id: string
  family_id: string
  label: string
  emoji: string | null
  position: number
  created_by: string | null
}

export const categoriesKey = (familyId: string) => ['categories', familyId] as const

export async function fetchCustomCategories(familyId: string): Promise<CustomCategory[]> {
  return unwrap(
    await supabase
      .from('item_categories')
      .select('id, family_id, label, emoji, position, created_by')
      .eq('family_id', familyId)
      .order('position')
      .order('label'),
  ) as CustomCategory[]
}

export function useCustomCategories(familyId: string) {
  return useQuery({ queryKey: categoriesKey(familyId), queryFn: () => fetchCustomCategories(familyId) })
}

export function useCategoryMutations() {
  const family = useActiveFamily()
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: categoriesKey(family.id) })
  const create = useMutation({
    mutationFn: async (input: { label: string; emoji: string | null; position: number }) =>
      unwrap(await supabase.from('item_categories').insert({ id: newId(), family_id: family.id, ...input })),
    onSuccess: invalidate,
  })
  const update = useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; label?: string; emoji?: string | null; position?: number }) =>
      unwrap(await supabase.from('item_categories').update(patch).eq('id', id)),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.from('item_categories').delete().eq('id', id)),
    onSuccess: () => {
      void invalidate()
      // Itens e produtos dessa categoria passaram para "Outros".
      void queryClient.invalidateQueries({ queryKey: ['items'] })
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      void queryClient.invalidateQueries({ queryKey: ['stock'] })
    },
  })
  return { create, update, remove }
}
