import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from 'react'
import { Button } from './Button'
import { TextField } from './Field'
import { Sheet } from './Sheet'

interface ConfirmOptions {
  title: string
  message?: ReactNode
  confirmLabel: string
  cancelLabel?: string
  tone?: 'danger' | 'default'
  /** Exige digitar este texto para confirmar (ações irreversíveis). */
  requireText?: string
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm fora do ConfirmProvider')
  return ctx
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const [typed, setTyped] = useState('')
  const resolver = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((next) => {
    setTyped('')
    setOptions(next)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const close = (value: boolean) => {
    resolver.current?.(value)
    resolver.current = null
    setOptions(null)
  }

  const textOk =
    !options?.requireText || typed.trim().toLocaleLowerCase('pt-BR') === options.requireText.trim().toLocaleLowerCase('pt-BR')

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Sheet
        open={options !== null}
        onClose={() => close(false)}
        title={options?.title ?? ''}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => close(false)}>
              {options?.cancelLabel ?? 'Cancelar'}
            </Button>
            <Button
              variant={options?.tone === 'danger' ? 'danger' : 'primary'}
              disabled={!textOk}
              onClick={() => close(true)}
            >
              {options?.confirmLabel}
            </Button>
          </div>
        }
      >
        {options?.message && <div className="text-ink-2">{options.message}</div>}
        {options?.requireText && (
          <TextField
            containerClassName="mt-4"
            label={`Digite "${options.requireText}" para confirmar`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
          />
        )}
      </Sheet>
    </ConfirmContext.Provider>
  )
}
