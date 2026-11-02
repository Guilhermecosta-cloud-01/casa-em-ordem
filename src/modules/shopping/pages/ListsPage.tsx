import { History, Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { PageBody, PageHeader } from '@/app/AppLayout'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/Controls'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { errorMessage } from '@/lib/errors'
import { useActiveFamily } from '@/modules/family/FamilyProvider'
import { ListCard } from '../components/ListCard'
import { ListFormSheet } from '../components/ListSheets'
import { useListMutations, useLists, useSummaries } from '../hooks'

export function ListsPage() {
  const family = useActiveFamily()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'active' | 'archived'>('active')
  const [creating, setCreating] = useState(false)
  const lists = useLists(tab)
  const summaries = useSummaries()
  const { create } = useListMutations()

  return (
    <>
      <PageHeader
        title="Listas"
        actions={
          <ButtonLink to="/historico" variant="ghost" size="sm" icon={<History className="size-5" />}>
            Histórico
          </ButtonLink>
        }
      />
      <PageBody>
        <div className="flex items-center gap-3">
          <Segmented
            className="flex-1"
            label="Situação das listas"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'active', label: 'Ativas' },
              { value: 'archived', label: 'Arquivadas' },
            ]}
          />
          <Button icon={<Plus className="size-5" strokeWidth={2.6} />} onClick={() => setCreating(true)}>
            Nova lista
          </Button>
        </div>

        <div className="mt-5 space-y-3">
          {lists.isPending ? (
            <>
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </>
          ) : lists.isError && !lists.data ? (
            <ErrorState message={errorMessage(lists.error)} onRetry={() => void lists.refetch()} />
          ) : lists.data.length === 0 ? (
            tab === 'active' ? (
              <EmptyState
                title="Nenhuma lista ativa"
                action={<Button onClick={() => setCreating(true)}>Criar a primeira lista</Button>}
              >
                Crie uma lista para a compra do mês, a feira ou o churrasco. Todos da família veem e editam juntos.
              </EmptyState>
            ) : (
              <EmptyState title="Nenhuma lista arquivada">
                Ao finalizar uma compra, a lista pode ser arquivada e fica guardada aqui.
              </EmptyState>
            )
          ) : (
            lists.data.map((list) => <ListCard key={list.id} list={list} summary={summaries.byList.get(list.id)} />)
          )}
        </div>
      </PageBody>

      <ListFormSheet
        open={creating}
        onClose={() => setCreating(false)}
        busy={create.isPending}
        onSubmit={(values) =>
          create.mutate(
            {
              familyId: family.id,
              name: values.name,
              description: values.description,
              listDate: values.list_date,
              budget: values.budget,
            },
            {
              onSuccess: (list) => {
                setCreating(false)
                navigate(`/listas/${list.id}`)
              },
            },
          )
        }
      />
    </>
  )
}
