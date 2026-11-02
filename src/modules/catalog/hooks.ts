import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/lib/errors'
import { useActiveFamily } from '@/modules/family/FamilyProvider'
import * as api from './api'
import type { ProductStats } from './types'

export function useProducts() {
  const family = useActiveFamily()
  return useQuery({ queryKey: ['products', family.id], queryFn: () => api.fetchProducts(family.id) })
}

export function useProductStats() {
  const family = useActiveFamily()
  const query = useQuery({ queryKey: ['product-stats', family.id], queryFn: () => api.fetchProductStats(family.id) })
  const byProduct = useMemo(
    () => new Map((query.data ?? []).map((s) => [s.product_id, s] as const)),
    [query.data],
  )
  return { ...query, byProduct } as typeof query & { byProduct: Map<string, ProductStats> }
}

export function useProduct(productId: string | undefined) {
  return useQuery({
    queryKey: ['product', productId],
    queryFn: () => api.fetchProduct(productId!),
    enabled: Boolean(productId),
  })
}

export function usePriceRecords(productId: string | undefined) {
  return useQuery({
    queryKey: ['price-records', productId],
    queryFn: () => api.fetchPriceRecords(productId!),
    enabled: Boolean(productId),
  })
}

export function useCatalogMutations() {
  const family = useActiveFamily()
  const queryClient = useQueryClient()
  const toast = useToast()
  const onError = (error: unknown) => toast.error(errorMessage(error))
  const refresh = (productId?: string) => {
    void queryClient.invalidateQueries({ queryKey: ['products'] })
    void queryClient.invalidateQueries({ queryKey: ['product-stats'] })
    if (productId) {
      void queryClient.invalidateQueries({ queryKey: ['product', productId] })
      void queryClient.invalidateQueries({ queryKey: ['price-records', productId] })
    }
  }

  return {
    create: useMutation({
      mutationFn: (input: api.ProductInput) => api.createProduct(family.id, input),
      onSuccess: (product) => refresh(product.id),
      onError,
    }),
    update: useMutation({
      mutationFn: ({ productId, patch }: { productId: string; patch: Partial<api.ProductInput> }) =>
        api.updateProduct(productId, patch),
      onSuccess: (product) => {
        queryClient.setQueryData(['product', product.id], product)
        refresh(product.id)
      },
      onError,
    }),
    remove: useMutation({
      mutationFn: api.deleteProduct,
      onSuccess: (_d, productId) => {
        queryClient.removeQueries({ queryKey: ['product', productId] })
        refresh()
      },
      onError,
    }),
    addPrice: useMutation({
      mutationFn: (input: api.PriceRecordInput) => api.addPriceRecord(family.id, input),
      onSuccess: (record) => refresh(record.product_id),
      onError,
    }),
    removePrice: useMutation({
      mutationFn: ({ recordId }: { recordId: string; productId: string }) => api.deletePriceRecord(recordId),
      onSuccess: (_d, vars) => refresh(vars.productId),
      onError,
    }),
  }
}
