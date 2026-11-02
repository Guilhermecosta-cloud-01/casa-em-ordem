import { Star } from 'lucide-react'
import { Link } from 'react-router'
import { Badge, ProgressBar } from '@/components/ui/Controls'
import { formatDate, formatMoney } from '@/lib/format'
import type { ListSummary, ShoppingList } from '../types'

export function ListCard({ list, summary }: { list: ShoppingList; summary: ListSummary | undefined }) {
  const count = summary?.items_count ?? 0
  const purchased = summary?.purchased_count ?? 0
  const progress = count === 0 ? 0 : purchased / count
  return (
    <Link
      to={`/listas/${list.id}`}
      className="block rounded-[var(--radius-panel)] bg-card px-4 py-3.5 ring-1 ring-line transition-shadow hover:ring-pen-line"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[1.125rem] font-bold">{list.name}</span>
            {list.is_featured && (
              <Badge tone="amber">
                <Star className="size-3.5 fill-current" aria-hidden /> Em destaque
              </Badge>
            )}
            {list.completed_at && <Badge tone="leaf">Compra finalizada</Badge>}
          </p>
          <p className="mt-0.5 truncate text-sm text-ink-2">
            {[list.list_date ? formatDate(list.list_date) : null, list.description].filter(Boolean).join(' — ') ||
              'Sem data'}
          </p>
        </div>
        <span className="shrink-0 font-tag text-[1.375rem] font-semibold leading-tight tabular">
          {formatMoney(summary?.estimated_total ?? 0)}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <ProgressBar value={progress} label={`Progresso de ${list.name}`} />
        <span className="shrink-0 text-sm font-semibold text-ink-2 tabular">
          {count === 0 ? 'vazia' : `${purchased}/${count}`}
        </span>
      </div>
    </Link>
  )
}
