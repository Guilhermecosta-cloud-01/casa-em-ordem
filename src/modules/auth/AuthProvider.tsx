import type { User } from '@supabase/supabase-js'
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { AppError, isNetworkError, toAppError } from '@/lib/errors'
import { clearLocalCache } from '@/lib/queryClient'
import { discardOpsOf, setOutboxUser } from '@/lib/sync/outbox'
import { supabase } from '@/lib/supabase'

export interface AuthUser {
  id: string
  email: string
}

interface AuthContextValue {
  status: 'loading' | 'signed_out' | 'signed_in'
  user: AuthUser | null
  /** Sessão mantida do último acesso porque o aparelho está sem internet. */
  offlineSession: boolean
  /** A pessoa chegou pelo link de redefinição de senha. */
  recovery: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (name: string, email: string, password: string) => Promise<{ needsConfirmation: boolean }>
  signOut: () => Promise<void>
  requestPasswordReset: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)
const LAST_USER_KEY = 'casa-em-ordem-last-user'

function readCachedUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(LAST_USER_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
}

function toAuthUser(user: User): AuthUser {
  return { id: user.id, email: user.email ?? '' }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthContextValue['status']>('loading')
  const [user, setUser] = useState<AuthUser | null>(null)
  const [offlineSession, setOfflineSession] = useState(false)
  const [recovery, setRecovery] = useState(false)

  const applySignedIn = useCallback((next: AuthUser, offline = false) => {
    setUser((prev) => (prev?.id === next.id && prev.email === next.email ? prev : next))
    setOfflineSession(offline)
    setStatus('signed_in')
    setOutboxUser(next.id)
    try {
      localStorage.setItem(LAST_USER_KEY, JSON.stringify(next))
    } catch {
      // armazenamento indisponível
    }
  }, [])

  const applySignedOut = useCallback(() => {
    setUser(null)
    setOfflineSession(false)
    setStatus('signed_out')
    setOutboxUser(null)
  }, [])

  useEffect(() => {
    let active = true
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return
        if (data.session?.user) {
          applySignedIn(toAuthUser(data.session.user))
          return
        }
        // Sem internet e com o token vencido: o Supabase mantém a sessão
        // guardada, mas não consegue renová-la agora. Seguimos com o último
        // usuário para mostrar os dados salvos no aparelho.
        const cached = readCachedUser()
        if (error && isNetworkError(error) && cached) applySignedIn(cached, true)
        else applySignedOut()
      })
      .catch(() => {
        const cached = readCachedUser()
        if (cached) applySignedIn(cached, true)
        else applySignedOut()
      })

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      if (session?.user) applySignedIn(toAuthUser(session.user))
      else if (event === 'SIGNED_OUT') applySignedOut()
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [applySignedIn, applySignedOut])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) throw toAppError(error)
  }, [])

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { display_name: name.trim() },
        emailRedirectTo: `${window.location.origin}/`,
      },
    })
    if (error) throw toAppError(error)
    // Com confirmação de e-mail ligada, o Supabase não devolve sessão.
    // Se o e-mail já existir, ele devolve um usuário sem identidades.
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      throw new AppError('Já existe uma conta com este e-mail. Tente entrar.')
    }
    return { needsConfirmation: !data.session }
  }, [])

  const signOut = useCallback(async () => {
    const current = user
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
    if (current) discardOpsOf(current.id)
    try {
      localStorage.removeItem(LAST_USER_KEY)
      if (current) localStorage.removeItem(`casa-em-ordem-family:${current.id}`)
    } catch {
      // ignore
    }
    await clearLocalCache().catch(() => undefined)
    applySignedOut()
  }, [user, applySignedOut])

  const requestPasswordReset = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    })
    if (error) throw toAppError(error)
  }, [])

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw toAppError(error)
    setRecovery(false)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, offlineSession, recovery, signIn, signUp, signOut, requestPasswordReset, updatePassword }),
    [status, user, offlineSession, recovery, signIn, signUp, signOut, requestPasswordReset, updatePassword],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth fora do AuthProvider')
  return ctx
}

/** Usuário conectado (para telas protegidas). */
export function useUser(): AuthUser {
  const { user } = useAuth()
  if (!user) throw new Error('Tela protegida sem usuário')
  return user
}
