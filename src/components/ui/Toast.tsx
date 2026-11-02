import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react'
import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { cn } from './cn'

type Tone = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  tone: Tone
  message: string
  action?: { label: string; onClick: () => void }
}

interface ToastApi {
  success: (message: string, action?: ToastItem['action']) => void
  error: (message: string, action?: ToastItem['action']) => void
  info: (message: string, action?: ToastItem['action']) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast fora do ToastProvider')
  return ctx
}

// Permite avisos vindos de fora do React (ex.: fila de sincronização).
let externalToast: ToastApi | null = null
export function toastFromOutside(): ToastApi | null {
  return externalToast
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), [])

  const push = useCallback(
    (tone: Tone, message: string, action?: ToastItem['action']) => {
      const id = nextId.current++
      setItems((list) => [...list.filter((t) => t.message !== message), { id, tone, message, action }].slice(-3))
      window.setTimeout(() => dismiss(id), tone === 'error' ? 7000 : action ? 6000 : 3500)
    },
    [dismiss],
  )

  const api = useMemo<ToastApi>(
    () => ({
      success: (m, a) => push('success', m, a),
      error: (m, a) => push('error', m, a),
      info: (m, a) => push('info', m, a),
    }),
    [push],
  )
  externalToast = api

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6"
        aria-live="polite"
        aria-relevant="additions"
      >
        {items.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex w-full max-w-md animate-sheet-in items-center gap-3 rounded-[var(--radius-field)] px-4 py-3 text-white shadow-[var(--shadow-float)]',
              toast.tone === 'success' && 'bg-ink',
              toast.tone === 'info' && 'bg-ink',
              toast.tone === 'error' && 'bg-alert',
            )}
          >
            {toast.tone === 'success' && <CheckCircle2 className="size-5 shrink-0 text-[#8fe3b6]" aria-hidden />}
            {toast.tone === 'info' && <Info className="size-5 shrink-0 text-[#b9c7f5]" aria-hidden />}
            {toast.tone === 'error' && <CircleAlert className="size-5 shrink-0" aria-hidden />}
            <p className="min-w-0 flex-1 text-[0.9375rem] leading-snug">{toast.message}</p>
            {toast.action && (
              <button
                type="button"
                className="shrink-0 rounded-lg px-2 py-1 font-semibold text-tag underline-offset-2 hover:underline"
                onClick={() => {
                  toast.action?.onClick()
                  dismiss(toast.id)
                }}
              >
                {toast.action.label}
              </button>
            )}
            <button
              type="button"
              aria-label="Fechar aviso"
              className="-mr-1 shrink-0 rounded-full p-1 opacity-80 hover:opacity-100"
              onClick={() => dismiss(toast.id)}
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
