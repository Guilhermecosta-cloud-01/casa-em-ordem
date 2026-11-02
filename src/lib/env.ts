const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? ''
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? ''
const pollMs = Number(import.meta.env.VITE_SYNC_POLL_MS ?? 15000)

export const env = {
  supabaseUrl: url,
  supabaseAnonKey: anonKey,
  /** Intervalo da consulta periódica quando o Realtime não está conectado. */
  syncPollMs: Number.isFinite(pollMs) && pollMs >= 2000 ? pollMs : 15000,
  configured: url !== '' && anonKey !== '',
  appVersion: (import.meta.env.VITE_APP_VERSION as string | undefined) ?? '1.0.0',
}
