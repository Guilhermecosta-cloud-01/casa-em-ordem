import { Check, CloudUpload, StickyNote } from 'lucide-react'
import { memo } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Stepper } from '@/components/ui/Controls'
import { cn } from '@/components/ui/cn'
import { toBig, toBigOrNull } from '@/lib/decimal'
import { formatMoney, formatNumber } from '@/lib/format'
import { priceRefUnit, UNIT_INFO } from '@/lib/units'
import { describeContentTotal, describeQuantity, lineTotal } from '../domain/totals'
import type { ListItem } from '../types'

function priceText(item: ListItem): string | null {
  const price = toBigOrNull(item.unit_price)
  if (price === null) return null
  if (item.price_basis === 'measure' && item.quantity !== null) {
    const ref = priceRefUnit(item.unit)
    return `${formatMoney(price)}/${ref === 'un' ? 'un' : UNIT_INFO[ref].singular}`
  }
  return `${formatMoney(price)} cada`
}

export const ItemRow = memo(function ItemRow({
  item,
  pending,
  creatorName,
  creatorAvatar,
  showCreator,
  onToggle,
  onAdjust,
  onOpen,
}: {
  item: ListItem
  pending: boolean
  creatorName: string
  creatorAvatar: string | null
  showCreator: boolean
  onToggle: (item: ListItem) => void
  onAdjust: (item: ListItem, delta: number) => void
  onOpen: (item: ListItem) => void
}) {
  const total = lineTotal(item)
  const packages = toBig(item.packages)
  const integerPackages = packages.round(0).eq(packages)
  const price = priceText(item)
  const content = describeContentTotal(item)
  const purchased = item.is_purchased

  return (
    <li className={cn('flex items-start gap-3 py-3 pl-1 pr-1', purchased && 'bg-leaf-soft/40')}>
      <button
        type="button"
        role="checkbox"
        aria-checked={purchased}
        aria-label={purchased ? `Desmarcar ${item.name}` : `Marcar ${item.name} como comprado`}
        onClick={() => onToggle(item)}
        className="-m-1.5 flex size-12 shrink-0 items-center justify-center rounded-full"
      >
        <span
          className={cn(
            'flex size-8 items-center justify-center rounded-full border-[2.5px] transition-colors',
            purchased ? 'border-leaf bg-leaf text-on-leaf' : 'border-line-strong bg-card text-transparent',
          )}
        >
          <Check className="size-5" strokeWidth={3.2} />
        </span>
      </button>

      <button type="button" onClick={() => onOpen(item)} className="min-w-0 flex-1 text-left">
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              'min-w-0 truncate text-[1.0625rem] font-semibold leading-snug',
              purchased && 'text-ink-3 line-through decoration-2',
            )}
          >
            {item.name}
          </span>
          {item.brand && <span className="shrink-0 truncate text-sm text-ink-2">{item.brand}</span>}
          {pending && (
            <span className="shrink-0 text-pen" title="Aguardando envio">
              <CloudUpload className="size-4" aria-hidden />
              <span className="sr-only">aguardando envio</span>
            </span>
          )}
        </span>
        <span className={cn('mt-0.5 flex flex-wrap items-center gap-x-2 text-[0.9375rem] text-ink-2', purchased && 'text-ink-3')}>
          <span className="tabular">{describeQuantity(item)}</span>
          {content && <span className="tabular">({content.replace(' no total', '')})</span>}
          {price && <span className="tabular">{price}</span>}
          {showCreator && (
            <span className="inline-flex items-center gap-1">
              <Avatar name={creatorName} src={creatorAvatar} seed={item.created_by ?? ''} size="xs" />
              <span className="sr-only">incluído por {creatorName}</span>
            </span>
          )}
        </span>
        {item.notes && (
          <span
            className={cn(
              'mt-1.5 flex items-start gap-1.5 rounded-lg px-2 py-1 text-[0.9375rem] leading-snug',
              purchased ? 'text-ink-3' : 'bg-amber-soft text-ink',
            )}
          >
            <StickyNote className="mt-0.5 size-4 shrink-0 text-amber" aria-hidden />
            <span className="line-clamp-2">{item.notes}</span>
          </span>
        )}
      </button>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className={cn('font-tag text-[1.25rem] font-semibold leading-none tabular', purchased ? 'text-ink-3' : 'text-ink')}>
          {total ? formatMoney(total) : <span className="text-sm font-normal text-ink-3">sem preço</span>}
        </span>
        {!purchased && integerPackages && (
          <Stepper
            size="sm"
            label={`embalagens de ${item.name}`}
            value={formatNumber(packages)}
            canDecrement={packages.gt(1)}
            onDecrement={() => onAdjust(item, -1)}
            onIncrement={() => onAdjust(item, 1)}
          />
        )}
      </div>
    </li>
  )
})
