import { isRouteErrorResponse, useRouteError } from 'react-router'
import { ButtonLink } from '@/components/ui/Button'
import { BrandMark } from './Brand'

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-md px-5 py-16">
      <BrandMark className="size-14" />
      <h1 className="mt-6 text-2xl font-bold">Página não encontrada</h1>
      <p className="mt-2 text-ink-2">O endereço pode ter mudado ou o registro foi removido.</p>
      <ButtonLink to="/" className="mt-6">
        Ir para o início
      </ButtonLink>
    </div>
  )
}

export function RouteErrorPage() {
  const error = useRouteError()
  const offlineChunk =
    error instanceof Error && /dynamically imported module|Failed to fetch|Importing a module script failed/i.test(error.message)
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />
  return (
    <div className="mx-auto max-w-md px-5 py-16">
      <BrandMark className="size-14" />
      <h1 className="mt-6 text-2xl font-bold">{offlineChunk ? 'Tela indisponível sem internet' : 'Algo deu errado'}</h1>
      <p className="mt-2 text-ink-2">
        {offlineChunk
          ? 'Esta tela ainda não foi guardada no aparelho. Conecte-se à internet e tente de novo.'
          : 'Recarregue a página. Se o problema continuar, feche e abra o app de novo.'}
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-6 min-h-12 rounded-[var(--radius-field)] bg-pen px-5 font-semibold text-white"
      >
        Recarregar
      </button>
    </div>
  )
}
