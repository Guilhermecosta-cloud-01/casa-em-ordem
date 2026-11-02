import type { ReactNode } from 'react'
import { cn } from './cn'

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <svg
      className={cn('animate-spin', className ?? 'size-5')}
      viewBox="0 0 24 24"
      fill="none"
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function LoadingBlock({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-ink-2" role="status">
      <Spinner />
      <span>{label}</span>
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-line/70', className)} aria-hidden />
}

export function EmptyState({
  title,
  children,
  action,
  icon,
}: {
  title: string
  children?: ReactNode
  action?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-[var(--radius-panel)] border-[1.5px] border-dashed border-line-strong bg-card/60 px-5 py-7">
      {icon && <div className="text-pen">{icon}</div>}
      <div>
        <p className="text-lg font-semibold text-ink">{title}</p>
        {children && <div className="mt-1 max-w-prose text-ink-2">{children}</div>}
      </div>
      {action}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-[var(--radius-panel)] border border-alert/30 bg-alert-soft px-5 py-5">
      <p className="font-semibold text-alert">Não foi possível carregar</p>
      <p className="mt-1 text-ink-2">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 min-h-11 rounded-[var(--radius-field)] bg-card px-4 font-semibold text-pen border-[1.5px] border-pen-line"
        >
          Tentar de novo
        </button>
      )}
    </div>
  )
}

export function Notice({
  tone = 'info',
  children,
  className,
}: {
  tone?: 'info' | 'warn' | 'danger' | 'success'
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-field)] px-4 py-3 text-[0.9375rem]',
        tone === 'info' && 'bg-pen-soft text-ink',
        tone === 'warn' && 'bg-amber-soft text-ink',
        tone === 'danger' && 'bg-alert-soft text-ink',
        tone === 'success' && 'bg-leaf-soft text-ink',
        className,
      )}
    >
      {children}
    </div>
  )
}
