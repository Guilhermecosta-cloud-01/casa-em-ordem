import { Check, CloudOff, CloudUpload, KeyRound, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/components/ui/cn'
import { Sheet } from '@/components/ui/Sheet'
import { Notice } from '@/components/ui/States'
import { formatRelative } from '@/lib/format'
import { useSyncState } from '@/lib/sync/hooks'
import { dismissFailed, flushOutbox } from '@/lib/sync/outbox'
import { useAuth } from '@/modules/auth/AuthProvider'

const TYPE_LABEL: Record<string, string> = {
  'item.insert': 'Incluir',
  'item.update': 'Alterar',
  'item.adjust': 'Mudar quantidade de',
  'item.delete': 'Remover',
}

/**
 * Indicador de sincronização. Só diz "salvo" quando o servidor confirmou;
 * alterações feitas sem internet aparecem como pendentes.
 */
export function SyncStatus({ className }: { className?: string }) {
  const { user, offlineSession } = useAuth()
  const { state, pending, failed, snapshot } = useSyncState(user?.id ?? null)
  const [open, setOpen] = useState(false)

  const pendingText = `${pending} pendente${pending > 1 ? 's' : ''}`
  const view = {
    synced: { icon: <Check className="size-4" />, text: '', label: 'Tudo salvo', tone: 'text-leaf bg-leaf-soft' },
    syncing: { icon: <CloudUpload className="size-4" />, text: 'Salvando', label: 'Salvando alterações', tone: 'text-pen bg-pen-soft' },
    pending: { icon: <CloudUpload className="size-4" />, text: pendingText, label: `${pendingText} de envio`, tone: 'text-pen bg-pen-soft' },
    offline: {
      icon: <CloudOff className="size-4" />,
      text: pending > 0 ? pendingText : 'Offline',
      label: pending > 0 ? `Sem internet, ${pendingText}` : 'Sem internet',
      tone: 'text-amber bg-amber-soft',
    },
    auth: { icon: <KeyRound className="size-4" />, text: 'Entrar', label: 'Sessão expirada', tone: 'text-amber bg-amber-soft' },
    error: { icon: <TriangleAlert className="size-4" />, text: `${failed} falhou`, label: `${failed} alteração não salva`, tone: 'text-alert bg-alert-soft' },
  }[state]

  // "Tudo salvo" aparece por alguns segundos depois de uma sincronização.
  const [recentlySynced, setRecentlySynced] = useState(false)
  useEffect(() => {
    if (snapshot.lastSyncedAt === null || Date.now() - snapshot.lastSyncedAt > 4000) return
    setRecentlySynced(true)
    const timer = window.setTimeout(() => setRecentlySynced(false), 3000)
    return () => window.clearTimeout(timer)
  }, [snapshot.lastSyncedAt])
  if (state === 'synced' && !recentlySynced && !open) return null

  const ops = snapshot.ops.filter((op) => op.userId === user?.id)
  const failures = snapshot.failed.filter((op) => op.userId === user?.id)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex min-h-9 min-w-9 shrink-0 items-center justify-center gap-1.5 rounded-full text-sm font-semibold',
          view.text ? 'px-3' : 'px-0',
          view.tone,
          className,
        )}
        aria-label={`Sincronização: ${view.label}. Ver detalhes`}
      >
        {view.icon}
        {view.text && <span className="whitespace-nowrap">{view.text}</span>}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Sincronização">
        <div className="space-y-4">
          {state === 'offline' && (
            <Notice tone="warn">
              Você está sem internet. As alterações ficam guardadas neste aparelho e são enviadas quando a conexão
              voltar. Os outros integrantes só verão as mudanças depois disso.
            </Notice>
          )}
          {offlineSession && (
            <Notice tone="warn">Mostrando os dados salvos no aparelho desde o último acesso com internet.</Notice>
          )}
          {state === 'auth' && (
            <Notice tone="warn">Sua sessão expirou. Saia e entre de novo para enviar as alterações pendentes.</Notice>
          )}
          {ops.length === 0 && failures.length === 0 && (
            <p className="text-ink-2">
              Todas as alterações foram salvas no servidor
              {snapshot.lastSyncedAt ? ` (${formatRelative(new Date(snapshot.lastSyncedAt))})` : ''}.
            </p>
          )}
          {ops.length > 0 && (
            <section>
              <h3 className="font-semibold">Aguardando envio</h3>
              <ul className="mt-2 ruled rounded-[var(--radius-field)] border border-line bg-card">
                {ops.map((op) => (
                  <li key={op.opId} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <span className="min-w-0 truncate">
                      {TYPE_LABEL[op.type] ?? 'Alterar'} <strong>{op.label}</strong>
                    </span>
                    <span className="shrink-0 text-sm text-ink-2">
                      {op.status === 'sending' ? 'enviando…' : formatRelative(new Date(op.createdAt))}
                    </span>
                  </li>
                ))}
              </ul>
              <Button className="mt-3" variant="secondary" onClick={() => void flushOutbox()}>
                Tentar enviar agora
              </Button>
            </section>
          )}
          {failures.length > 0 && (
            <section>
              <h3 className="font-semibold text-alert">Não foram salvas</h3>
              <p className="text-sm text-ink-2">
                O servidor recusou estas alterações. A lista já mostra a versão salva; refaça o que for preciso.
              </p>
              <ul className="mt-2 ruled rounded-[var(--radius-field)] border border-alert/30 bg-card">
                {failures.map((op) => (
                  <li key={op.opId} className="px-3 py-2.5">
                    <p>
                      {TYPE_LABEL[op.type] ?? 'Alterar'} <strong>{op.label}</strong>
                    </p>
                    <p className="text-sm text-ink-2">{op.message}</p>
                  </li>
                ))}
              </ul>
              <Button className="mt-3" variant="secondary" onClick={() => dismissFailed()}>
                Entendi, limpar avisos
              </Button>
            </section>
          )}
        </div>
      </Sheet>
    </>
  )
}
