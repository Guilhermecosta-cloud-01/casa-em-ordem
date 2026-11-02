import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Star, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { PageBody, PageHeader } from '@/app/AppLayout'
import { IconButton } from '@/components/ui/Button'
import { cn } from '@/components/ui/cn'
import { useConfirm } from '@/components/ui/Confirm'
import { Segmented } from '@/components/ui/Controls'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/lib/errors'
import { formatDate } from '@/lib/format'
import { useFamily } from '@/modules/family/FamilyProvider'
import { useActiveFamily } from '@/modules/family/FamilyProvider'
import { deleteComparison, fetchComparisons, type SavedComparison, setComparisonFavorite } from '../api'

export function SavedComparisonsPage() {
  const family = useActiveFamily()
  const { nameOf } = useFamily()
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const [tab, setTab] = useState<'favorites' | 'all'>('favorites')
  const query = useQuery({ queryKey: ['comparisons', family.id], queryFn: () => fetchComparisons(family.id) })

  const favorite = useMutation({
    mutationFn: ({ id, value }: { id: string; value: boolean }) => setComparisonFavorite(id, value),
    onMutate: async ({ id, value }) => {
      queryClient.setQueryData<SavedComparison[]>(['comparisons', family.id], (old) =>
        old?.map((c) => (c.id === id ? { ...c, is_favorite: value } : c)),
      )
    },
    onError: (e) => {
      toast.error(errorMessage(e))
      void query.refetch()
    },
  })

  const all = query.data ?? []
  const favorites = all.filter((c) => c.is_favorite)
  const shown = tab === 'favorites' ? favorites : all

  async function remove(comparison: SavedComparison) {
    const ok = await confirm({ title: `Excluir "${comparison.title || 'comparação'}"?`, confirmLabel: 'Excluir', tone: 'danger' })
    if (!ok) return
    try {
      await deleteComparison(comparison.id)
      void query.refetch()
      toast.success('Comparação excluída.')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <>
      <PageHeader title="Comparações salvas" back="/calculadora" />
      <PageBody>
        <Segmented
          label="Mostrar"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'favorites', label: 'Favoritas', count: favorites.length },
            { value: 'all', label: 'Histórico', count: all.length },
          ]}
        />
        <div className="mt-4">
          {query.isPending ? (
            <Skeleton className="h-24" />
          ) : query.isError && !query.data ? (
            <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
          ) : shown.length === 0 ? (
            <EmptyState title={tab === 'favorites' ? 'Nenhuma favorita ainda' : 'Nenhuma comparação salva'}>
              {tab === 'favorites'
                ? 'Marque a estrela de uma comparação para encontrá-la rápido aqui.'
                : 'Na calculadora, use "Salvar comparação" para guardar o resultado.'}
            </EmptyState>
          ) : (
            <ul className="ruled overflow-hidden rounded-[var(--radius-panel)] bg-card ring-1 ring-line">
              {shown.map((c) => (
                <li key={c.id} className="flex items-start gap-2 px-3 py-3">
                  <IconButton
                    label={c.is_favorite ? 'Tirar dos favoritos' : 'Marcar como favorita'}
                    onClick={() => favorite.mutate({ id: c.id, value: !c.is_favorite })}
                  >
                    <Star className={cn('size-6', c.is_favorite ? 'fill-tag text-tag-edge' : 'text-ink-3')} />
                  </IconButton>
                  <Link to={`/calculadora?salva=${c.id}`} className="min-w-0 flex-1 py-1">
                    <p className="truncate font-semibold">{c.title || 'Comparação'}</p>
                    {c.summary && <p className="mt-0.5 line-clamp-2 text-sm text-ink-2">{c.summary}</p>}
                    <p className="mt-1 text-xs text-ink-3">
                      {formatDate(c.created_at)}, por {nameOf(c.created_by, { you: 'lower' })}
                    </p>
                  </Link>
                  <IconButton label="Excluir comparação" tone="danger" onClick={() => void remove(c)}>
                    <Trash2 className="size-5" />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PageBody>
    </>
  )
}
