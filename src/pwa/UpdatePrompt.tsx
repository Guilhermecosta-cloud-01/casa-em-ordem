import { RefreshCw } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'

/** Avisa quando há uma nova versão do app, sem recarregar no meio de uma compra. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Verifica atualizações a cada hora enquanto o app estiver aberto.
      if (registration) setInterval(() => void registration.update(), 60 * 60 * 1000)
    },
  })

  if (!needRefresh) return null
  return (
    <div className="fixed inset-x-0 top-0 z-50 px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
      <div
        role="status"
        className="mx-auto flex max-w-md items-center gap-3 rounded-[var(--radius-field)] bg-ink px-4 py-3 text-white shadow-[var(--shadow-float)]"
      >
        <RefreshCw className="size-5 shrink-0 text-tag" aria-hidden />
        <p className="min-w-0 flex-1 text-[0.9375rem]">Nova versão do app disponível.</p>
        <button type="button" className="font-semibold text-tag" onClick={() => void updateServiceWorker(true)}>
          Atualizar
        </button>
        <button type="button" className="text-sm opacity-80" onClick={() => setNeedRefresh(false)}>
          Depois
        </button>
      </div>
    </div>
  )
}
