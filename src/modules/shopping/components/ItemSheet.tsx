import { Calculator, PackagePlus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { useConfirm } from '@/components/ui/Confirm'
import { Sheet } from '@/components/ui/Sheet'
import { Notice } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/lib/errors'
import { formatRelative } from '@/lib/format'
import { useUser } from '@/modules/auth/AuthProvider'
import { calculatorLinkFromItem } from '@/modules/calculator/links'
import { createProduct } from '@/modules/catalog/api'
import { useFamily } from '@/modules/family/FamilyProvider'
import { diffItem, emptyItemForm, type ItemFormErrors, type ItemFormState, itemToForm, validateItemForm } from '../domain/itemForm'
import type { ItemPatch, ListItem } from '../types'
import { ItemFields } from './ItemFields'

/**
 * Edição completa de um item. Envia só os campos alterados e avisa se outra
 * pessoa mexeu no item enquanto o painel estava aberto.
 */
export function ItemSheet({
  item,
  open,
  onClose,
  onSave,
  onDelete,
}: {
  item: ListItem | null
  open: boolean
  onClose: () => void
  onSave: (item: ListItem, patch: ItemPatch) => void
  onDelete: (item: ListItem) => void
}) {
  const user = useUser()
  const { nameOf, family } = useFamily()
  const toast = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [state, setState] = useState<ItemFormState>(emptyItemForm())
  const [errors, setErrors] = useState<ItemFormErrors>({})
  const [savingProduct, setSavingProduct] = useState(false)
  const openedVersion = useRef<string | null>(null)
  const openedId = useRef<string | null>(null)

  useEffect(() => {
    if (open && item && openedId.current !== item.id) {
      setState(itemToForm(item))
      setErrors({})
      openedVersion.current = item.updated_at
      openedId.current = item.id
    }
    if (!open) openedId.current = null
  }, [open, item])

  if (!item) return null

  const changedByOther = openedVersion.current !== null && item.updated_at !== openedVersion.current && item.updated_by !== user.id

  function save() {
    if (!item) return
    const result = validateItemForm(state)
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    const patch = diffItem(item as unknown as Record<string, unknown>, result.values as unknown as Record<string, unknown>) as ItemPatch
    onSave(item, patch)
    onClose()
  }

  async function remove() {
    if (!item) return
    const ok = await confirm({
      title: `Remover ${item.name}?`,
      message: 'O item sai da lista para todos da família.',
      confirmLabel: 'Remover',
      tone: 'danger',
    })
    if (ok) {
      onDelete(item)
      onClose()
    }
  }

  async function saveToCatalog() {
    if (!item || !family) return
    const result = validateItemForm(state)
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    setSavingProduct(true)
    try {
      const product = await createProduct(family.id, {
        name: result.values.name,
        category: result.values.category,
        brand: result.values.brand,
        unit: result.values.unit,
        package_size: result.values.quantity,
        notes: null,
      })
      onSave(item, { ...diffItem(item as unknown as Record<string, unknown>, result.values as unknown as Record<string, unknown>), product_id: product.id } as ItemPatch)
      toast.success(`${product.name} entrou no catálogo de produtos.`)
      onClose()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setSavingProduct(false)
    }
  }

  const meta = [
    `Incluído por ${nameOf(item.created_by, { you: 'lower' })} ${formatRelative(item.created_at)}`,
    item.updated_by && item.updated_at !== item.created_at
      ? `alterado por ${nameOf(item.updated_by, { you: 'lower' })} ${formatRelative(item.updated_at)}`
      : null,
    item.is_purchased && item.purchased_by ? `comprado por ${nameOf(item.purchased_by, { you: 'lower' })}` : null,
  ].filter(Boolean)

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Editar item"
      description={meta.join(', ')}
      footer={
        <div className="flex items-center gap-2">
          <Button variant="quiet-danger" icon={<Trash2 className="size-5" />} onClick={() => void remove()}>
            Remover
          </Button>
          <Button className="ml-auto min-w-36" size="lg" onClick={save}>
            Salvar
          </Button>
        </div>
      }
    >
      {changedByOther && (
        <Notice tone="warn" className="mb-4">
          {nameOf(item.updated_by)} alterou este item agora há pouco. Ao salvar, só os campos que você mudou serão
          substituídos.{' '}
          <button
            type="button"
            className="font-semibold text-pen underline"
            onClick={() => {
              setState(itemToForm(item))
              openedVersion.current = item.updated_at
            }}
          >
            Ver versão atual
          </button>
        </Notice>
      )}
      <ItemFields state={state} onChange={setState} errors={errors} />
      <div className="mt-6 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          icon={<Calculator className="size-4" />}
          onClick={() => {
            onClose()
            navigate(calculatorLinkFromItem({ name: state.name, brand: state.brand, unitPrice: state.unitPrice, quantity: state.quantity, unit: state.unit, productId: item.product_id }))
          }}
        >
          Comparar embalagens
        </Button>
        {item.product_id ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              onClose()
              navigate(`/produtos/${item.product_id}`)
            }}
          >
            Ver no catálogo
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            icon={<PackagePlus className="size-4" />}
            loading={savingProduct}
            onClick={() => void saveToCatalog()}
          >
            Salvar no catálogo
          </Button>
        )}
      </div>
    </Sheet>
  )
}
