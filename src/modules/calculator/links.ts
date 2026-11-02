import type { Unit } from '@/lib/units'
import { isCalcUnit } from './domain/units'

/** Abre a calculadora com a opção A preenchida a partir de um item ou produto. */
export function calculatorLinkFromItem(input: {
  name: string
  brand?: string | null
  unitPrice?: string | null
  quantity?: string | null
  unit: Unit
  productId?: string | null
}): string {
  const params = new URLSearchParams()
  if (input.name.trim()) params.set('nome', input.name.trim())
  if (input.brand?.trim()) params.set('marca', input.brand.trim())
  if (isCalcUnit(input.unit)) {
    params.set('unidade', input.unit)
    if (input.quantity?.trim()) params.set('conteudo', input.quantity.trim())
    if (input.unitPrice?.trim()) params.set('preco', input.unitPrice.trim())
  }
  if (input.productId) params.set('produto', input.productId)
  const query = params.toString()
  return query ? `/calculadora?${query}` : '/calculadora'
}
