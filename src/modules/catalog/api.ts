import { AppError, unwrap } from '@/lib/errors'
import { newId } from '@/lib/id'
import { supabase } from '@/lib/supabase'
import type { Unit } from '@/lib/units'
import type { PriceBasis } from '@/modules/shopping/types'
import type { PriceRecord, Product, ProductStats } from './types'

export type ProductInput = Pick<Product, 'name' | 'category' | 'brand' | 'unit' | 'package_size' | 'notes'>

export async function fetchProducts(familyId: string): Promise<Product[]> {
  return unwrap(await supabase.from('products').select('*').eq('family_id', familyId).order('name')) as Product[]
}

export async function fetchProductStats(familyId: string): Promise<ProductStats[]> {
  return unwrap(await supabase.from('product_price_stats').select('*').eq('family_id', familyId)) as ProductStats[]
}

export async function fetchProduct(productId: string): Promise<Product | null> {
  return unwrap(await supabase.from('products').select('*').eq('id', productId).maybeSingle()) as Product | null
}

export async function createProduct(familyId: string, input: ProductInput): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .insert({ id: newId(), family_id: familyId, ...input, name: input.name.trim() })
    .select()
    .single()
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new AppError('Já existe um produto com esse nome e marca no catálogo.')
    }
    throw error
  }
  return data as Product
}

export async function updateProduct(productId: string, patch: Partial<ProductInput>): Promise<Product> {
  const { data, error } = await supabase.from('products').update(patch).eq('id', productId).select()
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new AppError('Já existe um produto com esse nome e marca no catálogo.')
    }
    throw error
  }
  const rows = data as Product[]
  if (rows.length === 0) throw new AppError('Produto não encontrado.', { hint: 'NOT_FOUND' })
  return rows[0]!
}

export async function deleteProduct(productId: string): Promise<void> {
  const rows = unwrap(await supabase.from('products').delete().eq('id', productId).select('id'))
  if ((rows as unknown[]).length === 0) {
    throw new AppError('Somente quem cadastrou o produto ou um administrador pode excluí-lo.', { code: '42501' })
  }
}

export async function fetchPriceRecords(productId: string): Promise<PriceRecord[]> {
  return unwrap(
    await supabase
      .from('price_records')
      .select('*')
      .eq('product_id', productId)
      .order('recorded_on', { ascending: false })
      .order('created_at', { ascending: false }),
  ) as PriceRecord[]
}

export interface PriceRecordInput {
  productId: string
  price: string
  priceBasis: PriceBasis
  quantity: string | null
  unit: Unit
  storeId: string | null
  recordedOn: string
  notes: string | null
}

export async function addPriceRecord(familyId: string, input: PriceRecordInput): Promise<PriceRecord> {
  return unwrap(
    await supabase
      .from('price_records')
      .insert({
        id: newId(),
        family_id: familyId,
        product_id: input.productId,
        price: input.price,
        price_basis: input.priceBasis,
        quantity: input.quantity,
        unit: input.unit,
        store_id: input.storeId,
        recorded_on: input.recordedOn,
        notes: input.notes,
      })
      .select()
      .single(),
  ) as PriceRecord
}

export async function deletePriceRecord(recordId: string): Promise<void> {
  const rows = unwrap(await supabase.from('price_records').delete().eq('id', recordId).select('id'))
  if ((rows as unknown[]).length === 0) {
    throw new AppError('Somente quem registrou o preço ou um administrador pode excluí-lo.', { code: '42501' })
  }
}
