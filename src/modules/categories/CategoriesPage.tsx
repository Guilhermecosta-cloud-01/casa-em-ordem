import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { PageBody, PageHeader } from '@/app/AppLayout'
import { Button, IconButton } from '@/components/ui/Button'
import { useConfirm } from '@/components/ui/Confirm'
import { TextField } from '@/components/ui/Field'
import { Sheet } from '@/components/ui/Sheet'
import { ErrorState, LoadingBlock, Notice } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/lib/errors'
import { useOnline } from '@/lib/sync/hooks'
import { useActiveFamily, useFamily } from '@/modules/family/FamilyProvider'
import { CATEGORIES } from '@/modules/shopping/categories'
import { type CustomCategory, useCategoryMutations, useCustomCategories } from './hooks'

const EMOJI_SUGGESTIONS = ['🏷️', '🎉', '🧺', '🌱', '🍷', '🎒', '🧸', '🔌', '🚗', '🎁']

export function CategoriesPage() {
  const family = useActiveFamily()
  const { isAdmin } = useFamily()
  const query = useCustomCategories(family.id)
  const mutations = useCategoryMutations()
  const confirm = useConfirm()
  const toast = useToast()
  const online = useOnline()
  const [editing, setEditing] = useState<CustomCategory | 'new' | null>(null)
  const custom = query.data ?? []

  async function remove(category: CustomCategory) {
    const ok = await confirm({
      title: `Excluir "${category.label}"?`,
      message: 'Os itens, produtos e itens do estoque dessa categoria passam para "Outros".',
      confirmLabel: 'Excluir',
      tone: 'danger',
    })
    if (!ok) return
    mutations.remove.mutate(category.id, {
      onSuccess: () => toast.success('Categoria excluída.'),
      onError: (e) => toast.error(errorMessage(e)),
    })
  }

  function move(category: CustomCategory, direction: -1 | 1) {
    const index = custom.findIndex((c) => c.id === category.id)
    const other = custom[index + direction]
    if (!other) return
    // Reescreve as posições na ordem atual, trocando os dois de lugar.
    const order = custom.map((c) => c.id)
    order[index] = other.id
    order[index + direction] = category.id
    order.forEach((id, position) => {
      const current = custom.find((c) => c.id === id)
      if (current && current.position !== position) mutations.update.mutate({ id, position })
    })
  }

  return (
    <>
      <PageHeader
        title="Categorias"
        back="/mais"
        actions={
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing('new')} disabled={!online}>
            Nova
          </Button>
        }
      />
      <PageBody className="space-y-6">
        <p className="text-ink-2">
          Crie categorias para organizar listas, produtos e estoque do jeito da sua casa. Elas aparecem depois das categorias do app, antes de
          "Outros".
        </p>
        {!online && <Notice tone="info">Para criar ou mudar categorias é preciso estar com internet.</Notice>}

        <section aria-labelledby="da-familia">
          <h2 id="da-familia" className="mb-2 text-lg font-bold">
            Da família
          </h2>
          {query.isLoading && !query.data ? (
            <LoadingBlock />
          ) : query.error && !query.data ? (
            <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
          ) : custom.length === 0 ? (
            <p className="text-ink-2">Nenhuma ainda. Toque em "Nova" para criar.</p>
          ) : (
            <ul className="divide-y divide-line rounded-[var(--radius-panel)] bg-card px-3 ring-1 ring-line">
              {custom.map((c, i) => (
                <li key={c.id} className="flex items-center gap-2 py-2">
                  <span className="text-xl" aria-hidden>
                    {c.emoji || '🏷️'}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{c.label}</span>
                  <IconButton label={`Subir ${c.label}`} disabled={i === 0 || !online} onClick={() => move(c, -1)}>
                    <ArrowUp className="size-5" />
                  </IconButton>
                  <IconButton label={`Descer ${c.label}`} disabled={i === custom.length - 1 || !online} onClick={() => move(c, 1)}>
                    <ArrowDown className="size-5" />
                  </IconButton>
                  <IconButton label={`Renomear ${c.label}`} disabled={!online} onClick={() => setEditing(c)}>
                    <Pencil className="size-5" />
                  </IconButton>
                  <IconButton label={`Excluir ${c.label}`} tone="danger" disabled={!online} onClick={() => void remove(c)}>
                    <Trash2 className="size-5" />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
          {!isAdmin && custom.length > 0 && (
            <p className="mt-2 text-sm text-ink-2">Excluir uma categoria criada por outra pessoa é só para administradores.</p>
          )}
        </section>

        <section aria-labelledby="do-app">
          <h2 id="do-app" className="mb-2 text-lg font-bold">
            Do app
          </h2>
          <ul className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <li key={c.id} className="rounded-full bg-card px-3 py-1.5 text-sm ring-1 ring-line">
                <span aria-hidden>{c.emoji}</span> {c.label}
              </li>
            ))}
          </ul>
        </section>
      </PageBody>
      <CategorySheet
        key={editing === 'new' ? 'new' : editing?.id ?? 'none'}
        open={editing !== null}
        category={editing === 'new' ? null : editing}
        nextPosition={custom.length}
        onClose={() => setEditing(null)}
      />
    </>
  )
}

function CategorySheet({
  open,
  category,
  nextPosition,
  onClose,
}: {
  open: boolean
  category: CustomCategory | null
  nextPosition: number
  onClose: () => void
}) {
  const mutations = useCategoryMutations()
  const toast = useToast()
  const [label, setLabel] = useState(category?.label ?? '')
  const [emoji, setEmoji] = useState(category?.emoji ?? '🏷️')
  const [error, setError] = useState<string | null>(null)
  const pending = mutations.create.isPending || mutations.update.isPending

  function save(e: FormEvent) {
    e.preventDefault()
    const name = label.trim()
    if (!name) {
      setError('Dê um nome.')
      return
    }
    if (CATEGORIES.some((c) => c.label.toLowerCase() === name.toLowerCase())) {
      setError('Já existe uma categoria do app com esse nome.')
      return
    }
    const options = {
      onSuccess: () => {
        toast.success(category ? 'Categoria salva.' : 'Categoria criada.')
        onClose()
      },
      onError: (err: unknown) =>
        setError((err as { code?: string }).code === '23505' ? 'Já existe uma categoria com esse nome.' : errorMessage(err)),
    }
    const icon = emoji.trim() || null
    if (category) mutations.update.mutate({ id: category.id, label: name, emoji: icon }, options)
    else mutations.create.mutate({ label: name, emoji: icon, position: nextPosition }, options)
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={category ? 'Renomear categoria' : 'Nova categoria'}
      footer={
        <Button type="submit" form="category-form" size="lg" block loading={pending}>
          Salvar
        </Button>
      }
    >
      <form id="category-form" onSubmit={save} className="space-y-4" noValidate>
        <TextField label="Nome" value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} error={error} autoFocus />
        <div>
          <TextField label="Emoji" value={emoji} maxLength={8} onChange={(e) => setEmoji(e.target.value)} containerClassName="w-32" />
          <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Sugestões de emoji">
            {EMOJI_SUGGESTIONS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                aria-pressed={emoji === e}
                className="flex size-11 items-center justify-center rounded-[var(--radius-field)] text-xl ring-1 ring-line aria-pressed:bg-pen-soft aria-pressed:ring-pen"
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      </form>
    </Sheet>
  )
}
