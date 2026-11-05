import { Calculator, ChevronRight, ListPlus, Tag, TrendingDown, TrendingUp } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { PageBody, PageHeader } from '@/app/AppLayout'
import { Avatar } from '@/components/ui/Avatar'
import { ButtonLink } from '@/components/ui/Button'
import { Chip, ProgressBar } from '@/components/ui/Controls'
import { PriceTag } from '@/components/ui/PriceTag'
import { EmptyState, Skeleton } from '@/components/ui/States'
import { toBig } from '@/lib/decimal'
import { firstName, formatDate, formatMoney, formatPercent, greeting } from '@/lib/format'
import { useUser } from '@/modules/auth/AuthProvider'
import { priceMovers, type ProductTrend } from '@/modules/catalog/domain/priceStats'
import { useProductStats, useProducts } from '@/modules/catalog/hooks'
import { useActiveFamily, useFamily } from '@/modules/family/FamilyProvider'
import { ListCard } from '@/modules/shopping/components/ListCard'
import { LIST_TEMPLATES, ListFormSheet } from '@/modules/shopping/components/ListSheets'
import { budgetStatus } from '@/modules/shopping/domain/totals'
import { useListMutations, useLists, usePurchases, useSummaries } from '@/modules/shopping/hooks'
import { TodayPanel } from './TodayPanel'

export function HomePage() {
  const user = useUser()
  const family = useActiveFamily()
  const { nameOf, avatarOf, members } = useFamily()
  const navigate = useNavigate()
  const lists = useLists('active')
  const summaries = useSummaries()
  const purchases = usePurchases()
  const stats = useProductStats()
  const products = useProducts()
  const { create } = useListMutations()
  const [creating, setCreating] = useState<string | null>(null)

  const first = firstName(nameOf(user.id, { you: false }))
  const featured = lists.data?.find((l) => l.is_featured) ?? lists.data?.[0]
  const others = (lists.data ?? []).filter((l) => l.id !== featured?.id).slice(0, 3)
  const summary = featured ? summaries.byList.get(featured.id) : undefined
  const lastPurchase = purchases.data?.[0]
  const movers = priceMovers(stats.data ?? [])
  const productName = (id: string) => products.data?.find((p) => p.id === id)?.name ?? 'Produto'

  const estimated = toBig(summary?.estimated_total ?? 0)
  const budget = featured ? budgetStatus(featured.budget, estimated) : null
  const count = summary?.items_count ?? 0
  const bought = summary?.purchased_count ?? 0

  return (
    <>
      <PageHeader title={first && first !== 'Você' ? `${greeting()}, ${first}` : greeting()} subtitle={family.name} />
      <PageBody className="space-y-8">
        {lists.isPending ? (
          <Skeleton className="h-52" />
        ) : featured ? (
          <section aria-labelledby="featured-title" className="rounded-[var(--radius-panel)] bg-card p-5 ring-1 ring-line">
            <p className="text-sm font-semibold text-ink-2">{featured.is_featured ? 'Lista em destaque' : 'Lista mais recente'}</p>
            <h2 id="featured-title" className="mt-0.5 text-2xl font-bold leading-tight">
              {featured.name}
            </h2>
            {featured.list_date && <p className="text-ink-2">{formatDate(featured.list_date)}</p>}
            <div className="mt-4 flex flex-wrap items-end gap-4">
              <PriceTag value={estimated} label="Total estimado" size="lg" />
              <div className="min-w-44 flex-1">
                <p className="font-semibold">
                  {count === 0 ? 'Nenhum item ainda' : `${bought} de ${count} itens comprados`}
                </p>
                <div className="mt-2">
                  <ProgressBar value={count === 0 ? 0 : bought / count} label="Progresso da compra" />
                </div>
                {budget && (
                  <p className={budget.over ? 'mt-2 font-semibold text-alert' : 'mt-2 font-semibold text-leaf'}>
                    {budget.over
                      ? `Passou ${formatMoney(budget.difference.abs())} do orçamento`
                      : `Sobram ${formatMoney(budget.difference)} do orçamento`}
                  </p>
                )}
              </div>
            </div>
            <ButtonLink to={`/listas/${featured.id}`} size="lg" block className="mt-5">
              {bought > 0 ? 'Continuar a compra' : 'Abrir a lista'}
            </ButtonLink>
          </section>
        ) : (
          <EmptyState title={lastPurchase ? 'Nenhuma lista ativa' : 'Comece pela primeira lista'}>
            <p>
              {lastPurchase
                ? 'Crie a próxima lista ou repita uma compra pelo histórico.'
                : 'Escolha um modelo ou crie do seu jeito. Toda a família vê e edita a mesma lista.'}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {LIST_TEMPLATES.slice(0, 5).map((t) => (
                <Chip key={t} onClick={() => setCreating(t)}>
                  {t}
                </Chip>
              ))}
            </div>
          </EmptyState>
        )}

        <TodayPanel />

        <nav aria-label="Atalhos" className="grid grid-cols-3 gap-2">
          <Shortcut icon={<ListPlus className="size-6" />} label="Nova lista" onClick={() => setCreating('')} />
          <Shortcut icon={<Calculator className="size-6" />} label="Comparar preços" to="/calculadora" />
          <Shortcut icon={<Tag className="size-6" />} label="Registrar preço" to="/produtos" />
        </nav>

        {others.length > 0 && (
          <section aria-labelledby="others-title">
            <div className="flex items-center justify-between">
              <h2 id="others-title" className="text-lg font-bold">
                Outras listas
              </h2>
              <Link to="/listas" className="font-semibold text-pen">
                Ver todas
              </Link>
            </div>
            <div className="mt-3 space-y-3">
              {others.map((l) => (
                <ListCard key={l.id} list={l} summary={summaries.byList.get(l.id)} />
              ))}
            </div>
          </section>
        )}

        {(movers.up.length > 0 || movers.down.length > 0) && (
          <section aria-labelledby="prices-title">
            <h2 id="prices-title" className="text-lg font-bold">
              Preços que mudaram
            </h2>
            <p className="text-sm text-ink-2">Comparando os dois últimos registros de cada produto.</p>
            <ul className="mt-3 ruled rounded-[var(--radius-panel)] bg-card px-4 ring-1 ring-line">
              {[...movers.up.slice(0, 3), ...movers.down.slice(0, 3)].map((t) => (
                <MoverRow key={t.productId} trend={t} name={productName(t.productId)} />
              ))}
            </ul>
          </section>
        )}

        {lastPurchase && (
          <section aria-labelledby="last-title">
            <h2 id="last-title" className="text-lg font-bold">
              Última compra
            </h2>
            <Link
              to={`/historico/${lastPurchase.id}`}
              className="mt-3 flex items-center gap-3 rounded-[var(--radius-panel)] bg-card px-4 py-3.5 ring-1 ring-line hover:ring-pen-line"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{lastPurchase.name}</p>
                <p className="text-sm text-ink-2">{formatDate(lastPurchase.purchased_on)}</p>
              </div>
              <span className="font-tag text-xl font-semibold tabular">
                {formatMoney(lastPurchase.paid_total ?? lastPurchase.estimated_total)}
              </span>
              <ChevronRight className="size-5 text-ink-3" aria-hidden />
            </Link>
          </section>
        )}

        {members.length > 0 && (
          <section aria-labelledby="family-title" className="flex items-center justify-between gap-3">
            <div>
              <h2 id="family-title" className="text-lg font-bold">
                {family.name}
              </h2>
              <p className="text-sm text-ink-2">
                {members.length === 1 ? 'Só você por enquanto' : `${members.length} integrantes`}
              </p>
            </div>
            <Link to="/familia" className="flex -space-x-2" aria-label="Ver integrantes da família">
              {members.slice(0, 5).map((m) => (
                <Avatar
                  key={m.user_id}
                  name={nameOf(m.user_id, { you: false })}
                  src={avatarOf(m.user_id)}
                  seed={m.user_id}
                  size="md"
                />
              ))}
            </Link>
          </section>
        )}
      </PageBody>

      <ListFormSheet
        open={creating !== null}
        onClose={() => setCreating(null)}
        initialName={creating ?? ''}
        busy={create.isPending}
        onSubmit={(values) =>
          create.mutate(
            { familyId: family.id, name: values.name, description: values.description, listDate: values.list_date, budget: values.budget },
            {
              onSuccess: (list) => {
                setCreating(null)
                navigate(`/listas/${list.id}`)
              },
            },
          )
        }
      />
    </>
  )
}

function Shortcut({ icon, label, to, onClick }: { icon: ReactNode; label: string; to?: string; onClick?: () => void }) {
  const className =
    'flex min-h-24 flex-col items-center justify-center gap-2 rounded-[var(--radius-panel)] bg-card px-2 py-3 text-center text-[0.9375rem] font-semibold text-ink ring-1 ring-line hover:ring-pen-line'
  if (to) {
    return (
      <Link to={to} className={className}>
        <span className="text-pen">{icon}</span>
        {label}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      <span className="text-pen">{icon}</span>
      {label}
    </button>
  )
}

function MoverRow({ trend, name }: { trend: ProductTrend; name: string }) {
  const up = trend.trend === 'up'
  return (
    <li>
      <Link to={`/produtos/${trend.productId}`} className="flex items-center gap-3 py-3">
        <span className={up ? 'text-alert' : 'text-leaf'}>
          {up ? <TrendingUp className="size-5" aria-hidden /> : <TrendingDown className="size-5" aria-hidden />}
        </span>
        <span className="min-w-0 flex-1 truncate font-semibold">{name}</span>
        <span className={up ? 'font-semibold text-alert tabular' : 'font-semibold text-leaf tabular'}>
          {up ? '+' : '−'}
          {formatPercent(trend.variation.abs())}
        </span>
      </Link>
    </li>
  )
}
