import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/modules/auth/AuthProvider'
import { fetchMembers, fetchMemberships, fetchProfile, type FamilyRole, type Member, type Membership } from './api'

interface FamilyContextValue {
  memberships: Membership[]
  loading: boolean
  error: unknown
  family: { id: string; name: string } | null
  role: FamilyRole | null
  isAdmin: boolean
  members: Member[]
  setActiveFamily: (familyId: string) => void
  /** Nome para exibir; "Você" para a própria pessoa. */
  nameOf: (userId: string | null | undefined, options?: { you?: boolean | 'lower' }) => string
  avatarOf: (userId: string | null | undefined) => string | null
  refetch: () => Promise<unknown>
}

const FamilyContext = createContext<FamilyContextValue | null>(null)

const storageKey = (userId: string) => `casa-em-ordem-family:${userId}`

export function FamilyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const userId = user?.id ?? null

  const membershipsQuery = useQuery({
    queryKey: ['families', userId],
    queryFn: () => fetchMemberships(userId!),
    enabled: userId !== null,
  })

  const [activeId, setActiveId] = useState<string | null>(() => {
    if (!userId) return null
    try {
      return localStorage.getItem(storageKey(userId))
    } catch {
      return null
    }
  })

  useEffect(() => {
    if (!userId) {
      setActiveId(null)
      return
    }
    try {
      setActiveId(localStorage.getItem(storageKey(userId)))
    } catch {
      setActiveId(null)
    }
  }, [userId])

  const memberships = useMemo(
    () => (membershipsQuery.data ?? []).filter((m) => m.family !== null),
    [membershipsQuery.data],
  )
  const current = memberships.find((m) => m.family_id === activeId) ?? memberships[0] ?? null
  const familyId = current?.family_id ?? null

  // Perfil próprio: necessário antes de existir família (ex.: boas-vindas).
  const profileQuery = useQuery({
    queryKey: ['profile', userId],
    queryFn: () => fetchProfile(userId!),
    enabled: userId !== null,
    staleTime: 5 * 60_000,
  })

  const membersQuery = useQuery({
    queryKey: ['members', familyId],
    queryFn: () => fetchMembers(familyId!),
    enabled: familyId !== null,
    staleTime: 60_000,
  })

  const setActiveFamily = useCallback(
    (id: string) => {
      setActiveId(id)
      if (userId) {
        try {
          localStorage.setItem(storageKey(userId), id)
        } catch {
          // ignore
        }
      }
    },
    [userId],
  )

  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data])
  const memberMap = useMemo(() => new Map(members.map((m) => [m.user_id, m])), [members])

  const nameOf = useCallback(
    (id: string | null | undefined, options?: { you?: boolean | 'lower' }) => {
      if (!id) return 'alguém'
      if (options?.you === 'lower' && id === userId) return 'você'
      if (options?.you !== false && id === userId) return 'Você'
      const profile = memberMap.get(id)?.profile ?? (id === userId ? profileQuery.data : null)
      const name = profile?.display_name?.trim()
      return name || (id === userId ? 'Você' : 'Ex-integrante')
    },
    [memberMap, userId, profileQuery.data],
  )

  const avatarOf = useCallback(
    (id: string | null | undefined) => {
      if (!id) return null
      const profile = memberMap.get(id)?.profile ?? (id === userId ? profileQuery.data : null)
      return profile?.avatar_data ?? null
    },
    [memberMap, userId, profileQuery.data],
  )

  const value = useMemo<FamilyContextValue>(
    () => ({
      memberships,
      loading: membershipsQuery.isPending,
      error: membershipsQuery.error,
      family: current?.family ? { id: current.family.id, name: current.family.name } : null,
      role: current?.role ?? null,
      isAdmin: current?.role === 'admin',
      members,
      setActiveFamily,
      nameOf,
      avatarOf,
      refetch: () =>
        Promise.all([
          membershipsQuery.refetch(),
          queryClient.invalidateQueries({ queryKey: ['members'] }),
          queryClient.invalidateQueries({ queryKey: ['profile'] }),
        ]),
    }),
    [memberships, membershipsQuery, current, members, setActiveFamily, nameOf, avatarOf, queryClient],
  )

  return <FamilyContext.Provider value={value}>{children}</FamilyContext.Provider>
}

export function useFamily(): FamilyContextValue {
  const ctx = useContext(FamilyContext)
  if (!ctx) throw new Error('useFamily fora do FamilyProvider')
  return ctx
}

/** Família ativa (para telas que exigem uma). */
export function useActiveFamily(): { id: string; name: string } {
  const { family } = useFamily()
  if (!family) throw new Error('Tela sem família ativa')
  return family
}
