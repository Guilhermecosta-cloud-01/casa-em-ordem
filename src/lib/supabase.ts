import { createClient } from '@supabase/supabase-js'
import { env } from './env'

// Somente a chave pública (anon/publishable) chega ao navegador. O que cada
// pessoa pode ler ou alterar é decidido pelas políticas RLS no banco.
export const supabase = createClient(
  env.supabaseUrl || 'http://localhost:54321',
  env.supabaseAnonKey || 'chave-nao-configurada',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'casa-em-ordem-auth',
    },
    realtime: {
      params: { eventsPerSecond: 5 },
    },
  },
)
