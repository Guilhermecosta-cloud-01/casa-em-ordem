import { type ReactNode, useLayoutEffect, useState } from 'react'
import { Splash } from '@/app/Splash'
import { useFamily } from '@/modules/family/FamilyProvider'
import { setCustomCategories } from '@/modules/shopping/categories'
import { useCustomCategories } from './hooks'

/**
 * Carrega as categorias criadas pela família antes de mostrar as telas, para
 * que itens e produtos já apareçam na categoria certa. Sem internet e sem
 * nada guardado, segue só com as categorias do app.
 */
export function CategoriesGate({ children }: { children: ReactNode }) {
  const { family } = useFamily()
  const query = useCustomCategories(family?.id ?? '')
  const [version, setVersion] = useState(0)

  useLayoutEffect(() => {
    setCustomCategories(query.data ?? [])
    setVersion((v) => v + 1)
  }, [query.data])

  if (family && query.isPending && query.fetchStatus === 'fetching' && version === 0) return <Splash />
  return <>{children}</>
}
