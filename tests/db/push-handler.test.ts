// Função de notificações (api/push) contra o Supabase local, com o envio
// ao serviço de push simulado.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import webpush from 'web-push'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import handler from '../../api/push'
import { asUser, createUser, pool, type TestUser } from './helpers'

const envFile = readFileSync(fileURLToPath(new URL('../../.local-stack/env', import.meta.url)), 'utf8')
const stackEnv = Object.fromEntries(
  envFile
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)

let user: TestUser

function call(body: unknown, auth = 'Bearer segredo-de-teste') {
  return new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
    let status = 200
    const res = {
      status(code: number) {
        status = code
        return res
      },
      json(payload: unknown) {
        resolve({ status, body: payload as Record<string, unknown> })
      },
    }
    handler({ method: 'POST', headers: { authorization: auth }, body }, res).catch(reject)
  })
}

beforeAll(async () => {
  const keys = webpush.generateVAPIDKeys()
  process.env.SUPABASE_URL = stackEnv.VITE_SUPABASE_URL
  process.env.SUPABASE_SERVICE_ROLE_KEY = stackEnv.SUPABASE_SERVICE_ROLE_KEY
  process.env.VAPID_PUBLIC_KEY = keys.publicKey
  process.env.VAPID_PRIVATE_KEY = keys.privateKey
  process.env.VAPID_SUBJECT = 'mailto:teste@example.com'
  process.env.PUSH_WEBHOOK_SECRET = 'segredo-de-teste'
  user = await createUser('Push')
  await asUser(user, `select public.save_push_subscription('https://push.example/device-1', 'chave', 'auth')`)
  await asUser(user, `select public.save_push_subscription('https://push.example/device-2', 'chave', 'auth')`)
})

describe('função de notificações (api/push)', () => {
  it('recusa chamadas sem o segredo', async () => {
    expect((await call({ notification_id: crypto.randomUUID() }, 'Bearer errado')).status).toBe(401)
  })

  it('envia aos aparelhos, remove o que cancelou e não envia duas vezes', async () => {
    const { rows } = await pool.query(
      `insert into public.notifications (user_id, kind, title, body, url) values ($1, 'task', 'Nova tarefa para você', 'Varrer a varanda', '/tarefas') returning id`,
      [user.id],
    )
    const id = rows[0].id as string
    const send = vi
      .spyOn(webpush, 'sendNotification')
      .mockImplementation(async (subscription) => {
        if (subscription.endpoint.endsWith('device-2')) throw Object.assign(new Error('Gone'), { statusCode: 410 })
        return { statusCode: 201, body: '', headers: {} }
      })

    const first = await call({ notification_id: id })
    expect(first).toEqual({ status: 200, body: { status: 'sent', sent: 1, removed: 1 } })
    const payload = JSON.parse(String(send.mock.calls[0]![1]))
    expect(payload).toMatchObject({ title: 'Nova tarefa para você', body: 'Varrer a varanda', url: '/tarefas' })

    const { rows: subs } = await pool.query(`select endpoint from public.push_subscriptions where user_id = $1`, [user.id])
    expect(subs.map((s) => s.endpoint)).toEqual(['https://push.example/device-1'])
    const { rows: pushed } = await pool.query(`select pushed_at from public.notifications where id = $1`, [id])
    expect(pushed[0].pushed_at).not.toBeNull()

    const again = await call({ notification_id: id })
    expect(again.body.status).toBe('already_sent')
    send.mockRestore()
  })
})
