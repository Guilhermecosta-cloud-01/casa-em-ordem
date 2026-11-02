import { X } from 'lucide-react'
import { type ReactNode, useEffect, useId, useRef } from 'react'
import { IconButton } from './Button'
import { cn } from './cn'

/**
 * Painel modal: desliza de baixo no celular e aparece centralizado no
 * computador. Usa <dialog> nativo (foco preso, Esc fecha, leitores de tela).
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'md' | 'lg'
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      document.documentElement.style.overflow = 'hidden'
    } else if (!open && dialog.open) {
      dialog.close()
    }
    return () => {
      document.documentElement.style.overflow = ''
    }
  }, [open])

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const onCancel = (event: Event) => {
      event.preventDefault()
      onCloseRef.current()
    }
    dialog.addEventListener('cancel', onCancel)
    return () => dialog.removeEventListener('cancel', onCancel)
  }, [open])

  if (!open) return null

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClick={(event) => {
        // Toque no fundo escurecido fecha o painel.
        if (event.target === ref.current) onClose()
      }}
      className={cn(
        'm-0 mt-auto max-h-full w-full max-w-none border-0 bg-transparent p-0 text-ink backdrop:animate-fade-in',
        'sm:m-auto sm:w-[calc(100%-2rem)]',
        size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg',
      )}
    >
      <div
        className={cn(
          'flex max-h-[92dvh] flex-col animate-sheet-in bg-card shadow-[var(--shadow-sheet)]',
          'rounded-t-[var(--radius-sheet)] sm:rounded-[var(--radius-sheet)]',
        )}
      >
        <div className="flex items-start gap-3 px-5 pb-2 pt-4">
          <div className="min-w-0 flex-1 pt-1.5">
            <h2 id={titleId} className="text-xl font-bold leading-tight">
              {title}
            </h2>
            {description && <p className="mt-1 text-ink-2">{description}</p>}
          </div>
          <IconButton label="Fechar" onClick={onClose} className="-mr-2">
            <X className="size-6" />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-2">{children}</div>
        {footer && (
          <div className="safe-bottom border-t border-line bg-card px-5 py-3 sm:rounded-b-[var(--radius-sheet)]">
            {footer}
          </div>
        )}
      </div>
    </dialog>
  )
}

export interface ActionItem {
  label: string
  description?: string
  icon?: ReactNode
  onSelect: () => void
  tone?: 'default' | 'danger'
  disabled?: boolean
  hidden?: boolean
}

/** Lista de ações (menu "⋯") em formato de painel, confortável para o polegar. */
export function ActionSheet({
  open,
  onClose,
  title,
  actions,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  actions: ActionItem[]
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <ul className="-mx-2 flex flex-col">
        {actions
          .filter((a) => !a.hidden)
          .map((action) => (
            <li key={action.label}>
              <button
                type="button"
                disabled={action.disabled}
                onClick={() => {
                  onClose()
                  action.onSelect()
                }}
                className={cn(
                  'flex min-h-14 w-full items-center gap-4 rounded-[var(--radius-field)] px-3 py-2 text-left hover:bg-paper disabled:opacity-45',
                  action.tone === 'danger' ? 'text-alert' : 'text-ink',
                )}
              >
                <span className={cn('shrink-0', action.tone === 'danger' ? 'text-alert' : 'text-pen')}>
                  {action.icon}
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold">{action.label}</span>
                  {action.description && <span className="block text-sm text-ink-2">{action.description}</span>}
                </span>
              </button>
            </li>
          ))}
      </ul>
    </Sheet>
  )
}
