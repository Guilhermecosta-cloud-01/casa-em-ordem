import type { Unit } from '@/lib/units'
import type { PriceBasis } from '@/modules/shopping/types'

export interface Product {
  id: string
  family_id: string
  name: string
  category: string
  brand: string | null
  /** Unidade de referência. */
  unit: Unit
  /** Tamanho de embalagem habitual (na unidade acima). */
  package_size: number | string | null
  notes: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface PriceRecord {
  id: string
  family_id: string
  product_id: string
  store_id: string | null
  purchase_id: string | null
  price: number | string
  price_basis: PriceBasis
  quantity: number | string | null
  unit: Unit
  recorded_on: string
  source: 'manual' | 'purchase'
  notes: string | null
  /** kg, L ou a própria unidade. */
  ref_unit: string
  /** Preço por kg / L / unidade. */
  normalized_price: number | string
  created_by: string | null
  created_at: string
}

export interface ProductStats {
  product_id: string
  family_id: string
  last_record_id: string
  last_price: number | string
  last_price_basis: PriceBasis
  last_quantity: number | string | null
  last_unit: Unit
  ref_unit: string
  last_normalized: number | string
  last_recorded_on: string
  last_store_id: string | null
  previous_normalized: number | string | null
  previous_price: number | string | null
  previous_recorded_on: string | null
  min_normalized: number | string | null
  max_normalized: number | string | null
  comparable_count: number
  records_count: number
}
