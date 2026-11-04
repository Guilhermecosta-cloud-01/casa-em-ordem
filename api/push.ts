// Função da Vercel: o banco (pg_net) chama este endereço a cada notificação
// nova, e ela é enviada aos celulares da pessoa. Ver docs/NOTIFICACOES.md.
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

export interface NotificationRow {
  id: string
  user_id: string
  kind: 'chat' | 'task' | 'stock' | 'expense' | 'event'
  title: string
  body: string | null
  url: string | null
  ref_id: string | null
  pushed_at: string | null
}

export interface SubscriptionRow {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

export interface PushDeps {
  getNotification(id: string): Promise<NotificationRow | null>
  getPreferences(userId: string): Promise<Record<string, boolean> | null>
  getSubscriptions(userId: string): Promise<SubscriptionRow[]>
  /** Devolve o status HTTP do serviço de push (201 = entregue). */
  send(subscription: SubscriptionRow, payload: string): Promise<number>
  removeSubscription(id: string): Promise<void>
  markSubscriptionUsed(id: string): Promise<void>
  markPushed(notificationId: string): Promise<void>
}

const PREFERENCE_OF: Record<NotificationRow['kind'], string> = {
  chat: 'chat',
  task: 'tasks',
  stock: 'stock',
  expense: 'expenses',
  event: 'agenda',
}

export interface PushResult {
  status: 'sent' | 'skipped' | 'not_found' | 'already_sent' | 'muted' | 'no_devices'
  sent: number
  removed: number
}

export function buildPayload(n: NotificationRow): string {
  return JSON.stringify({
    title: n.title,
    body: n.body ?? '',
    url: n.url ?? '/',
    // Mensagens da mesma conversa se substituem no celular.
    tag: n.kind === 'chat' && n.ref_id ? `chat:${n.ref_id}` : n.id,
  })
}

export async function processNotification(deps: PushDeps, notificationId: string): Promise<PushResult> {
  const notification = await deps.getNotification(notificationId)
  if (!notification) return { status: 'not_found', sent: 0, removed: 0 }
  if (notification.pushed_at) return { status: 'already_sent', sent: 0, removed: 0 }

  const prefs = await deps.getPreferences(notification.user_id)
  if (prefs && prefs[PREFERENCE_OF[notification.kind]] === false) {
    await deps.markPushed(notification.id)
    return { status: 'muted', sent: 0, removed: 0 }
  }

  const subscriptions = await deps.getSubscriptions(notification.user_id)
  if (subscriptions.length === 0) {
    await deps.markPushed(notification.id)
    return { status: 'no_devices', sent: 0, removed: 0 }
  }

  const payload = buildPayload(notification)
  let sent = 0
  let removed = 0
  for (const subscription of subscriptions) {
    try {
      const status = await deps.send(subscription, payload)
      if (status >= 200 && status < 300) {
        sent += 1
        await deps.markSubscriptionUsed(subscription.id)
      }
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode
      // 404/410: o aparelho cancelou a inscrição (app desinstalado, permissão retirada).
      if (status === 404 || status === 410) {
        await deps.removeSubscription(subscription.id)
        removed += 1
      }
    }
  }
  await deps.markPushed(notification.id)
  return { status: 'sent', sent, removed }
}

/** Compara o segredo sem revelar, pelo tempo de resposta, quantos caracteres batem. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

interface Req {
  method?: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
}
interface Res {
  status(code: number): Res
  json(body: unknown): void
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' })

  const secret = process.env.PUSH_WEBHOOK_SECRET ?? ''
  const auth = String(req.headers.authorization ?? '')
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return res.status(401).json({ error: 'Não autorizado.' })

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY
  const publicKey = process.env.VAPID_PUBLIC_KEY ?? process.env.VITE_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:contato@example.com'
  if (!url || !serviceKey || !publicKey || !privateKey) {
    return res.status(500).json({ error: 'Faltam variáveis de ambiente (ver docs/NOTIFICACOES.md).' })
  }

  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as { notification_id?: string } | undefined
  const id = body?.notification_id
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'notification_id inválido.' })

  webpush.setVapidDetails(subject, publicKey, privateKey)
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  const result = await processNotification(
    {
      getNotification: async (nid) =>
        (await admin.from('notifications').select('id, user_id, kind, title, body, url, ref_id, pushed_at').eq('id', nid).maybeSingle())
          .data,
      getPreferences: async (userId) =>
        (await admin.from('notification_preferences').select('chat, tasks, stock, expenses, agenda').eq('user_id', userId).maybeSingle())
          .data,
      getSubscriptions: async (userId) =>
        (await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', userId)).data ?? [],
      send: async (s, payload) =>
        (
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
            TTL: 24 * 60 * 60,
          })
        ).statusCode,
      removeSubscription: async (sid) => {
        await admin.from('push_subscriptions').delete().eq('id', sid)
      },
      markSubscriptionUsed: async (sid) => {
        await admin.from('push_subscriptions').update({ last_used_at: new Date().toISOString() }).eq('id', sid)
      },
      markPushed: async (nid) => {
        await admin.from('notifications').update({ pushed_at: new Date().toISOString() }).eq('id', nid)
      },
    },
    id,
  )
  return res.status(200).json(result)
}
