import { env } from '@/lib/env'
import { unwrap } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

export type PushSupport = 'unsupported' | 'unconfigured' | 'needs-install' | 'ok'

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}

/** O que este aparelho permite: no iPhone, só com o app instalado na tela de início. */
export function pushSupport(): PushSupport {
  if (!env.vapidPublicKey) return 'unconfigured'
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (!supported) return isIos() && !isStandalone() ? 'needs-install' : 'unsupported'
  return 'ok'
}

function keyToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)
  return bytes
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== 'ok') return null
  const registration = await navigator.serviceWorker.getRegistration()
  return (await registration?.pushManager.getSubscription()) ?? null
}

/** Pede permissão, inscreve este aparelho e guarda a inscrição na conta. */
export async function enablePush(): Promise<'granted' | 'denied'> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'
  const registration = await navigator.serviceWorker.ready
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(env.vapidPublicKey) }))
  const json = subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  unwrap(
    await supabase.rpc('save_push_subscription', {
      p_endpoint: json.endpoint,
      p_p256dh: json.keys.p256dh,
      p_auth: json.keys.auth,
      p_user_agent: navigator.userAgent,
    }),
  )
  return 'granted'
}

export async function disablePush(): Promise<void> {
  const subscription = await currentSubscription()
  if (!subscription) return
  unwrap(await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint))
  await subscription.unsubscribe()
}
