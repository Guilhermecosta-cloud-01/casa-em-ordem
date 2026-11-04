import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { SelectField } from '@/components/ui/Field'
import { Sheet } from '@/components/ui/Sheet'
import { Notice } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/lib/errors'
import { newId } from '@/lib/id'
import { plural } from '@/lib/format'
import { useLists } from '../hooks'
import { queueInsertItem } from '../offline'

export interface ItemToSend {
  name: string
  category: string
  product_id: string | null
  packages: number
}

/** Põe um ou vários itens numa lista de compras (a lista em destaque vem marcada). */
export function SendToListSheet({
  open,
  onClose,
  items,
  title = 'Pôr na lista de compras',
}: {
  open: boolean
  onClose: () => void
  items: ItemToSend[]
  title?: string
}) {
  const lists = useLists('active')
  const toast = useToast()
  const [listId, setListId] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const featured = lists.data?.find((l) => l.is_featured) ?? lists.data?.[0]
    setListId(featured?.id ?? '')
    setError(null)
  }, [open, lists.data])

  function send() {
    const list = lists.data?.find((l) => l.id === listId)
    if (!list) {
      setError('Escolha uma lista.')
      return
    }
    try {
      for (const item of items) {
        queueInsertItem({
          id: newId(),
          family_id: list.family_id,
          list_id: list.id,
          product_id: item.product_id,
          name: item.name,
          category: item.category,
          brand: null,
          packages: String(item.packages),
          quantity: null,
          unit: 'un',
          unit_price: null,
          price_basis: 'package',
          notes: null,
          is_purchased: false,
        })
      }
      toast.success(
        items.length === 1
          ? `${items[0]!.name} incluído em ${list.name}.`
          : `${items.length} itens incluídos em ${list.name}.`,
      )
      onClose()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      description={
        items.length === 1
          ? `${items[0]!.name}: ${plural(items[0]!.packages, 'unidade', 'unidades')}`
          : `${items.length} itens: ${items.map((i) => i.name).join(', ')}`
      }
      footer={
        <Button size="lg" block onClick={send} disabled={!lists.data?.length}>
          Pôr na lista
        </Button>
      }
    >
      {lists.data && lists.data.length === 0 ? (
        <Notice tone="warn">Crie uma lista de compras primeiro, em Listas.</Notice>
      ) : (
        <SelectField label="Lista" value={listId} onChange={(e) => setListId(e.target.value)} error={error}>
          {(lists.data ?? []).map((list) => (
            <option key={list.id} value={list.id}>
              {list.name}
              {list.is_featured ? ' (em destaque)' : ''}
            </option>
          ))}
        </SelectField>
      )}
      <p className="mt-3 text-sm text-ink-2">Depois é só ajustar quantidade e preço na própria lista.</p>
    </Sheet>
  )
}
