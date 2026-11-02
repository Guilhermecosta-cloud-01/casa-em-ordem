import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router'
import { Avatar } from '@/components/ui/Avatar'
import { IconButton } from '@/components/ui/Button'
import { cn } from '@/components/ui/cn'
import { useAuth } from '@/modules/auth/AuthProvider'
import { useFamily } from '@/modules/family/FamilyProvider'
import { NAV_MODULES } from '@/modules/registry'
import { BrandMark } from './Brand'
import { SyncStatus } from './SyncStatus'

export function AppLayout() {
  return (
    <div className="min-h-dvh lg:flex">
      <SideNav />
      <div className="min-w-0 flex-1 pb-[calc(5.25rem+env(safe-area-inset-bottom))] lg:pb-10">
        <Outlet />
      </div>
      <BottomNav />
    </div>
  )
}

function BottomNav() {
  return (
    <nav
      aria-label="Navegação principal"
      className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 backdrop-blur lg:hidden"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {NAV_MODULES.map((module) => (
          <li key={module.id}>
            <NavLink
              to={module.path}
              end={module.path === '/'}
              className={({ isActive }) =>
                cn(
                  'flex min-h-16 flex-col items-center justify-center gap-0.5 px-1 text-[0.75rem] font-semibold',
                  isActive ? 'text-pen' : 'text-ink-2',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      'flex h-8 w-14 items-center justify-center rounded-full transition-colors',
                      isActive && 'bg-pen-soft',
                    )}
                  >
                    <module.icon className="size-[1.375rem]" strokeWidth={isActive ? 2.4 : 2} aria-hidden />
                  </span>
                  <span>{module.name}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function SideNav() {
  const { family } = useFamily()
  const { user } = useAuth()
  const { nameOf, avatarOf } = useFamily()
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-card px-4 py-6 lg:flex">
      <Link to="/" className="flex items-center gap-3 px-2">
        <BrandMark className="size-10" />
        <span className="leading-tight">
          <span className="block text-lg font-bold">Casa em Ordem</span>
          {family && <span className="block text-sm text-ink-2">{family.name}</span>}
        </span>
      </Link>
      <nav aria-label="Navegação principal" className="mt-8">
        <ul className="space-y-1">
          {NAV_MODULES.map((module) => (
            <li key={module.id}>
              <NavLink
                to={module.path}
                end={module.path === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-12 items-center gap-3 rounded-[var(--radius-field)] px-3 font-semibold',
                    isActive ? 'bg-pen-soft text-pen' : 'text-ink-2 hover:bg-paper hover:text-ink',
                  )
                }
              >
                <module.icon className="size-5" aria-hidden />
                {module.name}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      {user && (
        <Link to="/perfil" className="mt-auto flex items-center gap-3 rounded-[var(--radius-field)] px-2 py-2 hover:bg-paper">
          <Avatar name={nameOf(user.id, { you: false })} src={avatarOf(user.id)} seed={user.id} size="sm" />
          <span className="min-w-0">
            <span className="block truncate font-semibold">{nameOf(user.id, { you: false })}</span>
            <span className="block truncate text-sm text-ink-2">Meu perfil</span>
          </span>
        </Link>
      )}
    </aside>
  )
}

/** Cabeçalho das telas: título, voltar e ações à direita. */
export function PageHeader({
  title,
  subtitle,
  back,
  actions,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  back?: string | true
  actions?: ReactNode
  className?: string
}) {
  const navigate = useNavigate()
  return (
    <header
      className={cn(
        'safe-top sticky top-0 z-20 border-b border-transparent bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/75',
        className,
      )}
    >
      <div className="mx-auto flex min-h-16 max-w-3xl items-center gap-2 px-4 py-2">
        {back && (
          <IconButton
            label="Voltar"
            className="-ml-2"
            onClick={() => (back === true ? navigate(-1) : navigate(back))}
          >
            <ArrowLeft className="size-6" />
          </IconButton>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="line-clamp-2 break-words text-[1.25rem] font-bold leading-tight">{title}</h1>
          {subtitle && <p className="truncate text-sm text-ink-2">{subtitle}</p>}
        </div>
        <SyncStatus />
        {actions}
      </div>
    </header>
  )
}

export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={cn('mx-auto w-full max-w-3xl px-4 pb-6 pt-2', className)}>{children}</main>
}
