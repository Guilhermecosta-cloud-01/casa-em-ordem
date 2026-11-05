// ---------------------------------------------------------------------------
// Fila de sincronização (outbox)
//
// Alterações feitas no aparelho entram aqui antes de ir ao servidor. A fila:
//   * fica salva no IndexedDB (sobrevive a fechar o app sem internet);
//   * é enviada em ordem, uma operação por vez;
//   * só remove uma operação depois que o servidor confirma;
//   * separa falhas de conexão (tenta de novo depois) de recusas do servidor
//     (permissão, item removido por outra pessoa…), que viram "falhas" para
//     o usuário ver.
// O módulo é genérico: cada tipo de operação registra como é enviada.
// ---------------------------------------------------------------------------
import { get, set } from 'idb-keyval'
import { isAuthError, isNetworkError, toAppError } from '../errors'
import { newId } from '../id'

export interface QueuedOp<P = unknown> {
  opId: string
  type: string
  userId: string
  /** Agrupa operações (ex.: "list:<id>") para sobreposição e invalidação. */
  scope: string
  /** Registro afetado (ex.: id do item). */
  entityId: string
  payload: P
  /** Texto curto para mensagens ("Arroz"). */
  label: string
  createdAt: number
  attempts: number
  status: 'pending' | 'sending'
  lastError?: string
}

export interface FailedOp extends QueuedOp {
  failedAt: number
  message: string
}

export interface OpHandler<P = unknown, R = unknown> {
  send(op: QueuedOp<P>): Promise<R>
  /** Chamado após a confirmação do servidor (ex.: atualizar o cache local). */
  onSuccess?(op: QueuedOp<P>, result: R): void
  /** Erros que devem ser tratados como sucesso (ex.: inserção já aplicada). */
  isAlreadyApplied?(error: unknown): boolean
}

export interface OutboxSnapshot {
  ready: boolean
  ops: readonly QueuedOp[]
  failed: readonly FailedOp[]
  flushing: boolean
  /** Última vez que a fila esvaziou com sucesso. */
  lastSyncedAt: number | null
  /** Motivo da última pausa (sem conexão, sessão expirada). */
  pausedReason: 'offline' | 'auth' | null
}

type Coalescer = (queue: QueuedOp[], incoming: QueuedOp) => QueuedOp[]

interface OutboxConfig {
  handlers: Record<string, OpHandler<any, any>>
  coalesce?: Coalescer
  /** Renovar a sessão quando o servidor recusar o token. */
  refreshAuth?: () => Promise<boolean>
  onFailure?: (failed: FailedOp) => void
  onSettled?: (scopes: Set<string>) => void
}

const STORAGE_KEY = 'casa-em-ordem-outbox-v1'
const MAX_FAILED = 30

let config: OutboxConfig = { handlers: {} }
let state: OutboxSnapshot = {
  ready: false,
  ops: [],
  failed: [],
  flushing: false,
  lastSyncedAt: null,
  pausedReason: null,
}
let currentUserId: string | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let retryDelay = 2000
const listeners = new Set<() => void>()

function emit(next: Partial<OutboxSnapshot>) {
  state = { ...state, ...next }
  for (const listener of listeners) listener()
}

async function persist() {
  try {
    await set(STORAGE_KEY, { ops: state.ops, failed: state.failed })
  } catch {
    // Sem IndexedDB (modo privado antigo): a fila continua em memória.
  }
}

/** Operações registradas por outros módulos (tarefas, estoque, conversas...). */
interface Registration {
  types: Set<string>
  coalesce?: Coalescer
  onSettled?: (scopes: Set<string>) => void
}
const registrations: Registration[] = []

/**
 * Acrescenta tipos de operação à fila (cada módulo registra os seus). A
 * junção de operações redundantes e o aviso de conclusão valem só para os
 * tipos do próprio registro.
 */
export function registerOpHandlers(
  handlers: Record<string, OpHandler<any, any>>,
  options: { coalesce?: Coalescer; onSettled?: (scopes: Set<string>) => void } = {},
) {
  config = { ...config, handlers: { ...config.handlers, ...handlers } }
  registrations.push({ types: new Set(Object.keys(handlers)), ...options })
}

export function configureOutbox(next: OutboxConfig) {
  config = { ...next, handlers: { ...config.handlers, ...next.handlers } }
}

export function subscribeOutbox(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getOutboxSnapshot(): OutboxSnapshot {
  return state
}

/** Carrega a fila salva. Operações que estavam "enviando" voltam a "pendente". */
export async function loadOutbox(): Promise<void> {
  if (state.ready) return
  try {
    const saved = await get<{ ops?: QueuedOp[]; failed?: FailedOp[] }>(STORAGE_KEY)
    emit({
      ready: true,
      ops: (saved?.ops ?? []).map((op) => ({ ...op, status: 'pending' as const })),
      failed: saved?.failed ?? [],
    })
  } catch {
    emit({ ready: true })
  }
}

export function setOutboxUser(userId: string | null) {
  currentUserId = userId
  if (userId) void flushOutbox()
}

export function pendingCountFor(userId: string | null): number {
  return state.ops.filter((op) => op.userId === userId).length
}

export function enqueue<P>(input: {
  type: string
  scope: string
  entityId: string
  payload: P
  label: string
}): QueuedOp<P> {
  if (!currentUserId) throw new Error('Sem usuário conectado para registrar a alteração.')
  const op: QueuedOp<P> = {
    ...input,
    opId: newId(),
    userId: currentUserId,
    createdAt: Date.now(),
    attempts: 0,
    status: 'pending',
  }
  const owner = registrations.find((r) => r.types.has(op.type))
  const coalesce = owner ? owner.coalesce : config.coalesce
  const queue = coalesce ? coalesce([...state.ops], op) : [...state.ops, op]
  emit({ ops: queue })
  void persist()
  void flushOutbox()
  return op
}

export function dismissFailed(opId?: string) {
  emit({ failed: opId ? state.failed.filter((f) => f.opId !== opId) : [] })
  void persist()
}

/** Remove da fila as operações de um usuário (ex.: ao sair da conta). */
export function discardOpsOf(userId: string) {
  emit({
    ops: state.ops.filter((op) => op.userId !== userId),
    failed: state.failed.filter((op) => op.userId !== userId),
  })
  void persist()
}

function scheduleRetry() {
  if (retryTimer) return
  retryTimer = setTimeout(() => {
    retryTimer = null
    void flushOutbox()
  }, retryDelay)
  retryDelay = Math.min(retryDelay * 2, 30_000)
}

function replaceOp(opId: string, patch: Partial<QueuedOp>) {
  emit({ ops: state.ops.map((op) => (op.opId === opId ? { ...op, ...patch } : op)) })
}

export async function flushOutbox(): Promise<void> {
  if (!state.ready || state.flushing || !currentUserId) return
  emit({ flushing: true })
  const touched = new Set<string>()
  let authRetried = false
  try {
    for (;;) {
      const op = state.ops.find((o) => o.userId === currentUserId)
      if (!op) {
        retryDelay = 2000
        emit(touched.size > 0 ? { lastSyncedAt: Date.now(), pausedReason: null } : { pausedReason: null })
        break
      }
      const handler = config.handlers[op.type]
      if (!handler) {
        // Tipo desconhecido (versão antiga do app): descarta com aviso.
        failOp(op, 'Alteração de um tipo desconhecido; não foi enviada.')
        continue
      }
      replaceOp(op.opId, { status: 'sending', attempts: op.attempts + 1 })
      await persist()
      try {
        let result: unknown
        try {
          result = await handler.send(op)
        } catch (error) {
          if (handler.isAlreadyApplied?.(error)) result = null
          else throw error
        }
        handler.onSuccess?.(op, result)
        emit({ ops: state.ops.filter((o) => o.opId !== op.opId), pausedReason: null })
        touched.add(op.scope)
        await persist()
      } catch (error) {
        if (isNetworkError(error)) {
          replaceOp(op.opId, { status: 'pending', lastError: 'Sem conexão' })
          emit({ pausedReason: 'offline' })
          await persist()
          scheduleRetry()
          break
        }
        if (isAuthError(error)) {
          replaceOp(op.opId, { status: 'pending', lastError: 'Sessão expirada' })
          const refreshed = !authRetried && config.refreshAuth ? await config.refreshAuth() : false
          authRetried = true
          if (refreshed) continue
          emit({ pausedReason: 'auth' })
          await persist()
          scheduleRetry()
          break
        }
        failOp(op, toAppError(error).message)
        touched.add(op.scope)
      }
    }
  } finally {
    emit({ flushing: false })
    if (touched.size > 0) {
      config.onSettled?.(touched)
      for (const registration of registrations) registration.onSettled?.(touched)
    }
  }
}

function failOp(op: QueuedOp, message: string) {
  const failed: FailedOp = { ...op, status: 'pending', failedAt: Date.now(), message }
  emit({
    ops: state.ops.filter((o) => o.opId !== op.opId),
    failed: [failed, ...state.failed].slice(0, MAX_FAILED),
  })
  void persist()
  config.onFailure?.(failed)
}

// Reenvia quando a conexão volta ou o app volta para a tela.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    retryDelay = 2000
    void flushOutbox()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void flushOutbox()
  })
}
