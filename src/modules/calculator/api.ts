import { AppError, unwrap } from '@/lib/errors'
import { newId } from '@/lib/id'
import { supabase } from '@/lib/supabase'
import { type OptionInput } from './domain/compare'
import { type CalcUnit, isCalcUnit } from './domain/units'

export interface ComparisonPayload {
  version: 1
  options: OptionInput[]
  density: string
  target: { amount: string; unit: CalcUnit }
}

export interface SavedComparison {
  id: string
  family_id: string
  product_id: string | null
  title: string
  payload: ComparisonPayload
  summary: string | null
  is_favorite: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

/** Garante que uma comparação salva (talvez por uma versão antiga do app) tenha formato válido. */
export function sanitizePayload(raw: unknown): ComparisonPayload | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Partial<ComparisonPayload>
  if (!Array.isArray(value.options) || value.options.length < 2) return null
  const options: OptionInput[] = value.options.slice(0, 10).map((o, index) => {
    const option = (o ?? {}) as Partial<OptionInput>
    return {
      id: typeof option.id === 'string' ? option.id : `opt-${index}`,
      name: String(option.name ?? ''),
      brand: String(option.brand ?? ''),
      price: String(option.price ?? ''),
      content: String(option.content ?? ''),
      unit: isCalcUnit(option.unit) ? option.unit : 'g',
      packages: String(option.packages ?? ''),
    }
  })
  const target = value.target && isCalcUnit(value.target.unit) ? value.target : { amount: '', unit: options[0]!.unit }
  return { version: 1, options, density: String(value.density ?? ''), target: { amount: String(target.amount ?? ''), unit: target.unit } }
}

export async function fetchComparisons(familyId: string): Promise<SavedComparison[]> {
  return unwrap(
    await supabase
      .from('price_comparisons')
      .select('*')
      .eq('family_id', familyId)
      .order('created_at', { ascending: false })
      .limit(200),
  ) as SavedComparison[]
}

export async function fetchComparison(id: string): Promise<SavedComparison | null> {
  return unwrap(await supabase.from('price_comparisons').select('*').eq('id', id).maybeSingle()) as SavedComparison | null
}

export async function saveComparison(input: {
  familyId: string
  title: string
  payload: ComparisonPayload
  summary: string
  favorite: boolean
  productId: string | null
}): Promise<SavedComparison> {
  return unwrap(
    await supabase
      .from('price_comparisons')
      .insert({
        id: newId(),
        family_id: input.familyId,
        title: input.title.trim().slice(0, 80),
        payload: input.payload,
        summary: input.summary.slice(0, 400),
        is_favorite: input.favorite,
        product_id: input.productId,
      })
      .select()
      .single(),
  ) as SavedComparison
}

export async function setComparisonFavorite(id: string, favorite: boolean): Promise<void> {
  unwrap(await supabase.from('price_comparisons').update({ is_favorite: favorite }).eq('id', id))
}

export async function deleteComparison(id: string): Promise<void> {
  const rows = unwrap(await supabase.from('price_comparisons').delete().eq('id', id).select('id'))
  if ((rows as unknown[]).length === 0) {
    throw new AppError('Somente quem salvou a comparação ou um administrador pode excluí-la.', { code: '42501' })
  }
}
