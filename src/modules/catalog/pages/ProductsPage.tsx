import { ChevronRight, Plus, Search, TrendingDown, TrendingUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { PageBody, PageHeader } from '@/app/AppLayout'
import { Button } from '@/components/ui/Button'
import { cn } from '@/components/ui/cn'
import { Chip, Segmented } from '@/components/ui/Controls'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { errorMessage } from '@/lib/errors'
import { formatDateShort, formatPercent } from '@/lib/format'
import { compareText, matchesSearch } from '@/lib/text'
import { formatAmount } from '@/lib/units'
import { allCategories, getCategory } from '@/modules/shopping/categories'
import { ProductFormSheet } from '../components/CatalogSheets'
import { formatNormalized, productTrend } from '../domain/priceStats'
import { useProductStats, useProducts } from '../hooks'

type View = 'all' | 'up' | 'down'

export function ProductsPage() {
  const products = useProducts()
  const stats = useProductStats()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [view, setView] = useState<View>('all')
  const [creating, setCreating] = useState(false)

  const rows = useMemo(() => {
    const all = (products.data ?? []).map((product) => {
      const s = stats.byProduct.get(product.id)
      return { product, stats: s, trend: s ? productTrend(s) : null }
    })
    return all
      .filter((r) => !category || r.product.category === category)
      .filter((r) => matchesSearch(`${r.product.name} ${r.product.brand ?? ''}`, search))
      .filter((r) => view === 'all' || r.trend?.trend === view)
      .sort((a, b) =>
        view === 'up'
          ? b.trend!.variation.cmp(a.trend!.variation)
          : view === 'down'
            ? a.trend!.variation.cmp(b.trend!.variation)
            : compareText(a.product.name, b.product.name),
      )
  }, [products.data, stats.byProduct, category, search, view])

  const usedCategories = useMemo(
    () => allCategories().filter((c) => (products.data ?? []).some((p) => p.category === c.id)),
    [products.data],
  )
  const ups = (stats.data ?? []).filter((s) => productTrend(s)?.trend === 'up').length
  const downs = (stats.data ?? []).filter((s) => productTrend(s)?.trend === 'down').length

  return (
    <>
      <PageHeader
        title="Produtos"
        subtitle="Catálogo da família e histórico de preços"
        actions={
          <Button size="sm" icon={<Plus className="size-5" />} onClick={() => setCreating(true)}>
            Novo
          </Button>
        }
      />
      <PageBody>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-ink-3" aria-hidden />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar produto"
            aria-label="Buscar produto"
            className="field-input pl-11"
          />
        </div>
        <Segmented
          className="mt-3"
          label="Mostrar"
          value={view}
          onChange={setView}
          options={[
            { value: 'all', label: 'Todos', count: products.data?.length ?? 0 },
            { value: 'up', label: 'Subiram', count: ups },
            { value: 'down', label: 'Caíram', count: downs },
          ]}
        />
        {usedCategories.length > 1 && (
          <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1" aria-label="Filtrar por categoria">
            <Chip active={category === null} onClick={() => setCategory(null)}>
              Todas
            </Chip>
            {usedCategories.map((c) => (
              <Chip key={c.id} active={category === c.id} onClick={() => setCategory(category === c.id ? null : c.id)}>
                {c.emoji} {c.label}
              </Chip>
            ))}
          </div>
        )}

        <div className="mt-4">
          {products.isPending ? (
            <Skeleton className="h-40" />
          ) : products.isError && !products.data ? (
            <ErrorState message={errorMessage(products.error)} onRetry={() => void products.refetch()} />
          ) : (products.data ?? []).length === 0 ? (
            <EmptyState title="Catálogo vazio" action={<Button onClick={() => setCreating(true)}>Cadastrar produto</Button>}>
              O catálogo se forma sozinho quando vocês finalizam uma compra. Também dá para cadastrar produtos e registrar
              preços aqui.
            </EmptyState>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-ink-2">
              {view === 'all' ? 'Nenhum produto encontrado.' : 'Nenhum produto com essa variação nos dois últimos registros.'}
            </p>
          ) : (
            <ul className="ruled overflow-hidden rounded-[var(--radius-panel)] bg-card ring-1 ring-line">
              {rows.map(({ product, stats: s, trend }) => (
                <li key={product.id}>
                  <Link to={`/produtos/${product.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-paper">
                    <span aria-hidden className="text-xl">
                      {getCategory(product.category).emoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">
                        {product.name} {product.brand && <span className="font-normal text-ink-2">{product.brand}</span>}
                      </p>
                      <p className="truncate text-sm text-ink-2">
                        {product.package_size !== null
                          ? `Embalagem de ${formatAmount(product.package_size, product.unit)}`
                          : `Por ${product.unit === 'un' ? 'unidade' : product.unit}`}
                        {s && `, último em ${formatDateShort(s.last_recorded_on)}`}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      {s ? (
                        <>
                          <span className="block font-tag text-lg font-semibold tabular">
                            {formatNormalized(s.last_normalized, s.ref_unit)}
                          </span>
                          {trend && trend.trend !== 'stable' && (
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 text-sm font-semibold tabular',
                                trend.trend === 'up' ? 'text-alert' : 'text-leaf',
                              )}
                            >
                              {trend.trend === 'up' ? <TrendingUp className="size-4" aria-hidden /> : <TrendingDown className="size-4" aria-hidden />}
                              {trend.trend === 'up' ? '+' : '−'}
                              {formatPercent(trend.variation.abs())}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-sm text-ink-3">sem preço</span>
                      )}
                    </div>
                    <ChevronRight className="size-5 shrink-0 text-ink-3" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {rows.length > 0 && (
            <p className="mt-3 text-sm text-ink-2">
              Preços por kg, litro ou unidade, para comparar embalagens de tamanhos diferentes.
            </p>
          )}
        </div>
      </PageBody>
      <ProductFormSheet open={creating} onClose={() => setCreating(false)} onSaved={(p) => navigate(`/produtos/${p.id}`)} />
    </>
  )
}
