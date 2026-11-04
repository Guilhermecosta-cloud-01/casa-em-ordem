import { describe, expect, it } from 'vitest'
import { buildPayload, type NotificationRow, processNotification, type PushDeps, safeEqual, type SubscriptionRow } from './push'

const notification: NotificationRow = {
  id: 'n1',
  user_id: 'u1',
  kind: 'chat',
  title: 'Ana no grupo da família',
  body: 'Comprei pão',
  url: '/conversas/c1',
  ref_id: 'c1',
  pushed_at: null,
}

function fakeDeps(options: { prefs?: Record<string, boolean> | null; subs?: SubscriptionRow[]; statuses?: Record<string, number> } = {}) {
  const log = { sent: [] as string[], removed: [] as string[], pushed: [] as string[] }
  const deps: PushDeps = {
    getNotification: async (id) => (id === 'n1' ? notification : null),
    getPreferences: async () => options.prefs ?? null,
    getSubscriptions: async () => options.subs ?? [],
    send: async (s, payload) => {
      const status = options.statuses?.[s.id] ?? 201
      if (status >= 400) throw Object.assign(new Error('push failed'), { statusCode: status })
      log.sent.push(`${s.id}:${payload}`)
      return status
    },
    removeSubscription: async (id) => void log.removed.push(id),
    markSubscriptionUsed: async () => undefined,
    markPushed: async (id) => void log.pushed.push(id),
  }
  return { deps, log }
}

const sub = (id: string): SubscriptionRow => ({ id, endpoint: `https://push.example/${id}`, p256dh: 'k', auth: 'a' })

describe('notificações no celular', () => {
  it('envia para todos os aparelhos e remove os que cancelaram', async () => {
    const { deps, log } = fakeDeps({ subs: [sub('a'), sub('b'), sub('c')], statuses: { b: 410, c: 500 } })
    const result = await processNotification(deps, 'n1')
    expect(result).toEqual({ status: 'sent', sent: 1, removed: 1 })
    expect(log.removed).toEqual(['b'])
    expect(log.pushed).toEqual(['n1'])
  })

  it('respeita as preferências e não reenvia', async () => {
    const muted = fakeDeps({ prefs: { chat: false }, subs: [sub('a')] })
    expect((await processNotification(muted.deps, 'n1')).status).toBe('muted')
    expect(muted.log.sent).toHaveLength(0)
    const none = fakeDeps({ subs: [] })
    expect((await processNotification(none.deps, 'n1')).status).toBe('no_devices')
    expect((await processNotification(none.deps, 'outra')).status).toBe('not_found')
  })

  it('mensagens da mesma conversa usam a mesma etiqueta', () => {
    expect(JSON.parse(buildPayload(notification))).toEqual({
      title: 'Ana no grupo da família',
      body: 'Comprei pão',
      url: '/conversas/c1',
      tag: 'chat:c1',
    })
    expect(JSON.parse(buildPayload({ ...notification, kind: 'task', ref_id: 't1' })).tag).toBe('n1')
  })

  it('compara o segredo por inteiro', () => {
    expect(safeEqual('Bearer abc', 'Bearer abc')).toBe(true)
    expect(safeEqual('Bearer abd', 'Bearer abc')).toBe(false)
    expect(safeEqual('Bearer ab', 'Bearer abc')).toBe(false)
  })
})
