import type { Unit } from '@/lib/units'

export type PriceBasis = 'package' | 'measure'

/** Campos que definem quantidade e preço — iguais em itens, produtos e preços. */
export interface QuantityFields {
  packages: number | string
  quantity: number | string | null
  unit: Unit
  unit_price: number | string | null
  price_basis: PriceBasis
}

export interface ShoppingList {
  id: string
  family_id: string
  name: string
  description: string | null
  list_date: string | null
  status: 'active' | 'archived'
  is_featured: boolean
  budget: number | string | null
  completed_at: string | null
  archived_at: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface ListSummary {
  list_id: string
  family_id: string
  items_count: number
  purchased_count: number
  unpriced_count: number
  estimated_total: number | string
  purchased_total: number | string
  items_updated_at: string | null
}

export interface ListItem extends QuantityFields {
  id: string
  family_id: string
  list_id: string
  product_id: string | null
  name: string
  category: string
  brand: string | null
  notes: string | null
  is_purchased: boolean
  purchased_at: string | null
  purchased_by: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

/** Campos que a interface pode alterar num item. */
export type ItemPatch = Partial<
  Pick<
    ListItem,
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
    | 'product_id'
  >
>

export interface Store {
  id: string
  family_id: string
  name: string
}

export interface Purchase {
  id: string
  family_id: string
  list_id: string | null
  store_id: string | null
  name: string
  purchased_on: string
  estimated_total: number | string
  paid_total: number | string | null
  items_count: number
  purchased_count: number
  notes: string | null
  stock_applied_at?: string | null
  created_by: string | null
  created_at: string
}

export interface PurchaseItem extends QuantityFields {
  id: string
  purchase_id: string
  product_id: string | null
  name: string
  category: string
  brand: string | null
  line_total: number | string | null
}
