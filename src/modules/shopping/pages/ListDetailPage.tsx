import {
  Archive,
  ArchiveRestore,
  CheckCheck,
  Copy,
  MoreVertical,
  Pencil,
  Search,
  Star,
  StarOff,
  Trash2,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { PageBody, PageHeader } from '@/app/AppLayout'
import { Button, IconButton } from '@/components/ui/Button'
import { useConfirm } from '@/components/ui/Confirm'
import { Segmented } from '@/components/ui/Controls'
import { SelectField } from '@/components/ui/Field'
import { ActionSheet } from '@/components/ui/Sheet'
import { EmptyState, ErrorState, LoadingBlock, Notice } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { toBig } from '@/lib/decimal'
import { errorMessage } from '@/lib/errors'
import { formatDate, formatNumber } from '@/lib/format'
import { compareText, matchesSearch } from '@/lib/text'
import { useUser } from '@/modules/auth/AuthProvider'
import { useProductStats, useProducts } from '@/modules/catalog/hooks'
import { useFamily } from '@/modules/family/FamilyProvider'
import { getCategory, guessCategory } from '../categories'
import { ItemRow } from '../components/ItemRow'
import { ItemSheet } from '../components/ItemSheet'
import { BudgetSheet, CompleteSheet, DuplicateSheet, ListFormSheet } from '../components/ListSheets'
import { ListSummaryPanel } from '../components/ListSummaryPanel'
import { type QuickAddChoice, QuickAddBar } from '../components/QuickAddBar'
import { listTotals } from '../domain/totals'
import { useItemActions, useList, useListItems, useListMutations, useListPurchase } from '../hooks'
import type { ListItem, ShoppingList } from '../types'

type Filter = 'all' | 'pending' | 'purchased'
type Sort = 'category' | 'name' | 'status'

const SORT_KEY = 'casa-em-ordem-sort'

function readSort(): Sort {
  try {
    const value = localStorage.getItem(SORT_KEY)
    return value === 'name' || value === 'status' ? value : 'category'
  } catch {
    return 'category'
  }
}

export function ListDetailPage() {
  const { listId } = useParams()
  const listQuery = useList(listId)
  const list = listQuery.data

  if (listQuery.isPending) {
    return (
      <>
        <PageHeader title="Lista" back="/listas" />
        <LoadingBlock />
      </>
    )
  }
  if (!list) {
    return (
      <>
        <PageHeader title="Lista" back="/listas" />
        <PageBody>
          {listQuery.isError ? (
            <ErrorState message={errorMessage(listQuery.error)} onRetry={() => void listQuery.refetch()} />
          ) : (
            <EmptyState title="Lista não encontrada">
              Ela pode ter sido excluída ou pertence a outra família.
            </EmptyState>
          )}
        </PageBody>
      </>
    )
  }
  return <ListDetail list={list} />
}

function ListDetail({ list }: { list: ShoppingList }) {
  const user = useUser()
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { nameOf, avatarOf, isAdmin, members } = useFamily()
  const { items, pendingIds, isPending, isError, error, refetch, live } = useListItems(list.id)
  const actions = useItemActions(list)
  const mutations = useListMutations()
  const purchase = useListPurchase(list.id, Boolean(list.completed_at))
  const products = useProducts()
  const stats = useProductStats()

  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>(readSort)
  const [search, setSearch] = useState('')
  const [searching, setSearching] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [sheet, setSheet] = useState<'edit' | 'budget' | 'complete' | 'duplicate' | null>(null)

  const totals = useMemo(() => listTotals(items), [items])
  const editing = editingId ? items.find((i) => i.id === editingId) ?? null : null
  const archived = list.status === 'archived'
  const canDelete = isAdmin || list.created_by === user.id
  const showCreators = members.length > 1

  const visible = useMemo(() => {
    let result = items
    if (filter === 'pending') result = result.filter((i) => !i.is_purchased)
    if (filter === 'purchased') result = result.filter((i) => i.is_purchased)
    if (search.trim()) result = result.filter((i) => matchesSearch(`${i.name} ${i.brand ?? ''} ${i.notes ?? ''}`, search))
    const byName = (a: ListItem, b: ListItem) => compareText(a.name, b.name)
    const byCategory = (a: ListItem, b: ListItem) => getCategory(a.category).index - getCategory(b.category).index
    const byStatus = (a: ListItem, b: ListItem) => Number(a.is_purchased) - Number(b.is_purchased)
    const sorted = [...result]
    if (sort === 'name') sorted.sort(byName)
    else if (sort === 'status') sorted.sort((a, b) => byStatus(a, b) || byCategory(a, b) || byName(a, b))
    else sorted.sort((a, b) => byCategory(a, b) || byStatus(a, b) || byName(a, b))
    return sorted
  }, [items, filter, search, sort])

  const groups = useMemo(() => {
    if (sort !== 'category') return [{ key: 'all', title: null as string | null, items: visible }]
    const map = new Map<string, ListItem[]>()
    for (const item of visible) {
      const key = getCategory(item.category).id
      map.set(key, [...(map.get(key) ?? []), item])
    }
    return [...map.entries()].map(([key, groupItems]) => {
      const category = getCategory(key)
      return { key, title: `${category.emoji} ${category.label}`, items: groupItems }
    })
  }, [visible, sort])

  function addFromChoice(choice: QuickAddChoice) {
    if (choice.kind === 'product') {
      const product = choice.product
      const existing = items.find((i) => i.product_id === product.id && !i.is_purchased)
      if (existing) {
        actions.adjust(existing, 1)
        toast.info(`${product.name} já estava na lista: agora ${formatNumber(toBig(existing.packages).plus(1))}.`)
        return
      }
      const s = stats.byProduct.get(product.id)
      actions.add({
        product_id: product.id,
        name: product.name,
        category: product.category,
        brand: product.brand,
        packages: 1,
        quantity: s ? s.last_quantity : product.package_size,
        unit: s ? s.last_unit : product.unit,
        unit_price: s ? s.last_price : null,
        price_basis: s ? s.last_price_basis : 'package',
        notes: null,
        is_purchased: false,
      })
      return
    }
    const { name, packages, quantity, unit } = choice.parsed
    actions.add({
      product_id: null,
      name,
      category: guessCategory(name),
      brand: null,
      packages: packages?.toString() ?? '1',
      quantity: quantity?.toString() ?? null,
      unit: unit ?? 'un',
      unit_price: null,
      price_basis: 'package',
      notes: null,
      is_purchased: false,
    })
  }

  async function removeList() {
    const ok = await confirm({
      title: `Excluir "${list.name}"?`,
      message: 'A lista e todos os itens serão apagados para toda a família. Compras já finalizadas continuam no histórico.',
      confirmLabel: 'Excluir lista',
      tone: 'danger',
    })
    if (!ok) return
    mutations.remove.mutate(list.id, {
      onSuccess: () => {
        toast.success('Lista excluída.')
        navigate('/listas', { replace: true })
      },
    })
  }

  function setArchived(value: boolean) {
    mutations.update.mutate(
      { listId: list.id, patch: { status: value ? 'archived' : 'active' } },
      { onSuccess: () => toast.success(value ? 'Lista arquivada.' : 'Lista reativada.') },
    )
  }

  const subtitle = [list.list_date ? formatDate(list.list_date) : null, list.description].filter(Boolean).join(' — ')

  return (
    <>
      <PageHeader
        title={list.name}
        subtitle={subtitle || undefined}
        back="/listas"
        actions={
          <IconButton label="Opções da lista" onClick={() => setMenuOpen(true)}>
            <MoreVertical className="size-6" />
          </IconButton>
        }
      />
      <PageBody>
        {archived && (
          <Notice tone="warn" className="mb-3 flex items-center justify-between gap-3">
            <span>Esta lista está arquivada.</span>
            <Button size="sm" variant="secondary" onClick={() => setArchived(false)} loading={mutations.update.isPending}>
              Reativar
            </Button>
          </Notice>
        )}

        <ListSummaryPanel list={list} totals={totals} purchase={purchase.data} onEditBudget={() => setSheet('budget')} />

        {!archived && totals.itemsCount > 0 && totals.purchasedCount === totals.itemsCount && (
          <Notice tone="success" className="mt-3 flex items-center justify-between gap-3">
            <span className="font-semibold">Tudo comprado!</span>
            <Button size="sm" icon={<CheckCheck className="size-4" />} onClick={() => setSheet('complete')}>
              Finalizar compra
            </Button>
          </Notice>
        )}

        <div className="mt-5 flex items-center gap-2">
          {searching ? (
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-ink-3" aria-hidden />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar na lista"
                aria-label="Buscar na lista"
                className="field-input pl-11 pr-11"
              />
              <IconButton
                label="Fechar busca"
                className="absolute right-0.5 top-1/2 -translate-y-1/2"
                onClick={() => {
                  setSearch('')
                  setSearching(false)
                }}
              >
                <X className="size-5" />
              </IconButton>
            </div>
          ) : (
            <>
              <Segmented
                className="flex-1"
                label="Filtrar itens"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: 'Todos', count: totals.itemsCount },
                  { value: 'pending', label: 'Faltam', count: totals.itemsCount - totals.purchasedCount },
                  { value: 'purchased', label: 'Comprados', count: totals.purchasedCount },
                ]}
              />
              <IconButton label="Buscar item" onClick={() => setSearching(true)}>
                <Search className="size-5" />
              </IconButton>
            </>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <SelectField
            label="Ordenar por"
            labelHidden
            containerClassName="w-auto"
            className="min-h-10 border-0 bg-transparent py-1 pl-0 pr-8 font-semibold text-pen"
            value={sort}
            onChange={(e) => {
              const value = e.target.value as Sort
              setSort(value)
              try {
                localStorage.setItem(SORT_KEY, value)
              } catch {
                // ignore
              }
            }}
          >
            <option value="category">Ordenar por categoria</option>
            <option value="name">Ordenar por nome</option>
            <option value="status">Ordenar por situação</option>
          </SelectField>
          <span className="text-sm text-ink-2" aria-live="polite">
            {live === 'live' ? 'Atualizando ao vivo' : live === 'connecting' ? '' : 'Atualização periódica'}
          </span>
        </div>

        <div className="mt-1">
          {isPending && items.length === 0 ? (
            <LoadingBlock label="Carregando itens…" />
          ) : isError && items.length === 0 ? (
            <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
          ) : items.length === 0 ? (
            <EmptyState title="Lista vazia">
              Use o campo abaixo para incluir itens. Dá para escrever a quantidade junto, como "3 arroz 5kg" ou "1,5 kg
              carne".
            </EmptyState>
          ) : visible.length === 0 ? (
            <p className="py-10 text-center text-ink-2">
              {search.trim()
                ? `Nenhum item encontrado para "${search.trim()}".`
                : filter === 'pending'
                  ? 'Nada faltando: todos os itens já foram comprados.'
                  : 'Nenhum item marcado como comprado ainda.'}
            </p>
          ) : (
            groups.map((group) => (
              <section key={group.key} className="mt-3" aria-label={group.title ?? 'Itens'}>
                {group.title && (
                  <h2 className="flex items-center justify-between px-1 pb-1 text-[0.9375rem] font-bold text-ink-2">
                    <span>{group.title}</span>
                    <span className="text-sm font-semibold tabular">
                      {group.items.filter((i) => i.is_purchased).length}/{group.items.length}
                    </span>
                  </h2>
                )}
                <ul className="ruled overflow-hidden rounded-[var(--radius-panel)] bg-card px-2 ring-1 ring-line">
                  {group.items.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      pending={pendingIds.has(item.id)}
                      creatorName={nameOf(item.created_by, { you: false })}
                      creatorAvatar={avatarOf(item.created_by)}
                      showCreator={showCreators && item.created_by !== user.id}
                      onToggle={actions.togglePurchased}
                      onAdjust={actions.adjust}
                      onOpen={(i) => setEditingId(i.id)}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>

        {!archived && <QuickAddBar products={products.data ?? []} stats={stats.byProduct} onAdd={addFromChoice} />}
      </PageBody>

      <ItemSheet
        item={editing}
        open={editing !== null}
        onClose={() => setEditingId(null)}
        onSave={actions.update}
        onDelete={actions.remove}
      />

      <ActionSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={list.name}
        actions={[
          { label: 'Editar lista', description: 'Nome, descrição, data e orçamento', icon: <Pencil className="size-5" />, onSelect: () => setSheet('edit') },
          {
            label: 'Finalizar compra',
            description: 'Registra valores e preços no histórico',
            icon: <CheckCheck className="size-5" />,
            onSelect: () => setSheet('complete'),
            hidden: archived,
          },
          list.is_featured
            ? {
                label: 'Tirar do destaque',
                icon: <StarOff className="size-5" />,
                onSelect: () => mutations.feature.mutate({ listId: list.id, featured: false }),
              }
            : {
                label: 'Destacar na tela inicial',
                description: 'A lista da vez, para toda a família',
                icon: <Star className="size-5" />,
                onSelect: () =>
                  mutations.feature.mutate(
                    { listId: list.id, featured: true },
                    { onSuccess: () => toast.success('Lista em destaque na tela inicial.') },
                  ),
                hidden: archived,
              },
          { label: 'Duplicar lista', description: 'Reaproveita os itens numa lista nova', icon: <Copy className="size-5" />, onSelect: () => setSheet('duplicate') },
          archived
            ? { label: 'Reativar lista', icon: <ArchiveRestore className="size-5" />, onSelect: () => setArchived(false) }
            : { label: 'Arquivar lista', icon: <Archive className="size-5" />, onSelect: () => setArchived(true) },
          {
            label: 'Excluir lista',
            description: canDelete ? undefined : 'Só quem criou ou um administrador',
            icon: <Trash2 className="size-5" />,
            tone: 'danger',
            disabled: !canDelete,
            onSelect: () => void removeList(),
          },
        ]}
      />

      <ListFormSheet
        open={sheet === 'edit'}
        onClose={() => setSheet(null)}
        list={list}
        busy={mutations.update.isPending}
        onSubmit={(values) =>
          mutations.update.mutate({ listId: list.id, patch: values }, { onSuccess: () => setSheet(null) })
        }
      />
      <BudgetSheet
        open={sheet === 'budget'}
        onClose={() => setSheet(null)}
        list={list}
        estimated={totals.estimated.toString()}
        busy={mutations.update.isPending}
        onSave={(budget) => mutations.update.mutate({ listId: list.id, patch: { budget } }, { onSuccess: () => setSheet(null) })}
      />
      <CompleteSheet
        open={sheet === 'complete'}
        onClose={() => setSheet(null)}
        list={list}
        totals={totals}
        onCompleted={(purchaseId) => {
          setSheet(null)
          toast.success('Compra finalizada e registrada no histórico.')
          navigate(`/historico/${purchaseId}`)
        }}
      />
      <DuplicateSheet
        open={sheet === 'duplicate'}
        onClose={() => setSheet(null)}
        list={list}
        busy={mutations.duplicate.isPending}
        onSubmit={(name) =>
          mutations.duplicate.mutate(
            { listId: list.id, name },
            {
              onSuccess: (newId) => {
                setSheet(null)
                toast.success('Lista duplicada.')
                navigate(`/listas/${newId}`)
              },
            },
          )
        }
      />
    </>
  )
}
