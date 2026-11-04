import { Check } from 'lucide-react'
import { cn } from './cn'

/** Caixa de seleção redonda e grande (área de toque de 48 px). */
export function CheckCircle({
  checked,
  onToggle,
  label,
  className,
}: {
  checked: boolean
  onToggle: () => void
  label: string
  className?: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className={cn('-m-1.5 flex size-12 shrink-0 items-center justify-center rounded-full', className)}
    >
      <span
        className={cn(
          'flex size-8 items-center justify-center rounded-full border-[2.5px] transition-colors',
          checked ? 'border-leaf bg-leaf text-on-leaf' : 'border-line-strong bg-card text-transparent',
        )}
      >
        <Check className="size-5" strokeWidth={3.2} />
      </span>
    </button>
  )
}

/** Marca discreta de "aguardando envio" (alteração feita sem internet). */
export function PendingMark({ pending }: { pending: boolean }) {
  if (!pending) return null
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber">
      <span className="size-2 rounded-full bg-amber" aria-hidden />
      pendente
      <span className="sr-only">: aguardando envio ao servidor</span>
    </span>
  )
}
