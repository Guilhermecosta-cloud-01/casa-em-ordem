import { Navigate, Outlet, useLocation } from 'react-router'
import { ErrorState } from '@/components/ui/States'
import { errorMessage } from '@/lib/errors'
import { useAuth } from '@/modules/auth/AuthProvider'
import { useFamily } from '@/modules/family/FamilyProvider'
import { Splash } from './Splash'

export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <Splash />
  if (status === 'signed_out') {
    const next = `${location.pathname}${location.search}`
    return <Navigate to={next === '/' ? '/entrar' : `/entrar?next=${encodeURIComponent(next)}`} replace />
  }
  return <Outlet />
}

export function RequireFamily() {
  const { memberships, loading, error, refetch } = useFamily()
  if (loading) return <Splash />
  if (memberships.length === 0) {
    if (error) {
      return (
        <div className="mx-auto max-w-md px-5 pt-16">
          <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
        </div>
      )
    }
    return <Navigate to="/comecar" replace />
  }
  return <Outlet />
}
