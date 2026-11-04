import { Minus, Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from './cn'

export function Stepper({
  value,
  onDecrement,
  onIncrement,
  canDecrement = true,
  label,
  size = 'md',
}: {
  value: ReactNode
  onDecrement: () => void
  onIncrement: () => void
  canDecrement?: boolean
  label: string
  size?: 'sm' | 'md'
}) {
  const button =
    'inline-flex items-center justify-center rounded-full text-pen transition-colors hover:bg-pen-soft active:bg-pen-line disabled:text-ink-3 disabled:hover:bg-transparent'
  const dim = size === 'sm' ? 'size-10' : 'size-11'
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex shrink-0 items-center rounded-full border-[1.5px] border-pen-line bg-card"
    >
      <button
        type="button"
        className={cn(button, dim)}
        onClick={onDecrement}
        disabled={!canDecrement}
        aria-label={`Diminuir ${label}`}
      >
        <Minus className="size-5" strokeWidth={2.5} />
      </button>
      <span className="min-w-8 text-center font-tag text-xl font-semibold tabular" aria-live="polite">
        {value}
      </span>
      <button type="button" className={cn(button, dim)} onClick={onIncrement} aria-label={`Aumentar ${label}`}>
        <Plus className="size-5" strokeWidth={2.5} />
      </button>
    </div>
  )
}

export interface SegmentOption<T extends string> {
  value: T
  label: ReactNode
  count?: number
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T
  onChange: (value: T) => void
  options: SegmentOption<T>[]
  label: string
  className?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('flex gap-1 rounded-full bg-line/60 p-1', className)}>
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-[0.9375rem] font-semibold transition-colors',
              active ? 'bg-card text-ink shadow-sm' : 'text-ink-2 hover:text-ink',
            )}
          >
            {option.label}
            {option.count !== undefined && (
              <span className={cn('tabular text-sm', active ? 'text-ink-2' : 'text-ink-3')}>{option.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function ProgressBar({ value, label, tone = 'leaf' }: { value: number; label: string; tone?: 'leaf' | 'pen' | 'alert' }) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct * 100)}
      className="h-2.5 w-full overflow-hidden rounded-full bg-line"
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-300',
          tone === 'leaf' && 'bg-leaf',
          tone === 'pen' && 'bg-pen',
          tone === 'alert' && 'bg-alert',
        )}
        style={{ width: `${pct * 100}%` }}
      />
    </div>
  )
}

export function Chip({
  children,
  active,
  onClick,
  className,
}: {
  children: ReactNode
  active?: boolean
  onClick?: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border-[1.5px] px-3.5 text-[0.9375rem] font-semibold transition-colors',
        active ? 'border-pen bg-pen text-on-pen' : 'border-line-strong bg-card text-ink hover:border-pen-line',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'pen' | 'leaf' | 'amber' | 'alert' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.8125rem] font-semibold',
        tone === 'neutral' && 'bg-line/70 text-ink-2',
        tone === 'pen' && 'bg-pen-soft text-pen',
        tone === 'leaf' && 'bg-leaf-soft text-leaf',
        tone === 'amber' && 'bg-amber-soft text-amber',
        tone === 'alert' && 'bg-alert-soft text-alert',
      )}
    >
      {children}
    </span>
  )
}
