import type { Unit } from '@/lib/units'

export interface StockItem {
  id: string
  family_id: string
  product_id: string | null
  name: string
  category: string
  unit: Unit
  quantity: number | string
  min_quantity: number | string | null
  location: string | null
  notes: string | null
  is_low: boolean
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export type StockFields = Pick<StockItem, 'product_id' | 'name' | 'category' | 'unit' | 'quantity' | 'min_quantity' | 'location' | 'notes'>
