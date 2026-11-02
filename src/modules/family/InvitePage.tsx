import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { BrandLockup } from '@/app/Brand'
import { Button, ButtonLink } from '@/components/ui/Button'
import { ErrorState, LoadingBlock, Notice } from '@/components/ui/States'
import { errorMessage } from '@/lib/errors'
import { formatDate } from '@/lib/format'
import { useAuth } from '@/modules/auth/AuthProvider'
import { acceptInvite, previewInvite } from './api'
import { useFamily } from './FamilyProvider'

export function InvitePage() {
  const { token = '' } = useParams()
  const { status } = useAuth()
  const { setActiveFamily, refetch } = useFamily()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const preview = useQuery({
    queryKey: ['invite-preview', token, status],
    queryFn: () => previewInvite(token),
    enabled: status !== 'loading',
    retry: false,
  })

  const next = `/convite/${encodeURIComponent(token)}`

  async function onAccept() {
    setBusy(true)
    setError(null)
    try {
      const familyId = await acceptInvite(token)
      setActiveFamily(familyId)
      await queryClient.invalidateQueries({ queryKey: ['families'] })
      await refetch()
      navigate('/', { replace: true })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  let content
  if (preview.isPending) content = <LoadingBlock label="Abrindo convite…" />
  else if (preview.isError) content = <ErrorState message={errorMessage(preview.error)} onRetry={() => void preview.refetch()} />
  else {
    const data = preview.data
    const familyName = data.family_name ?? 'uma família'
    switch (data.status) {
      case 'valid':
        content = (
          <>
            <h1 className="text-[1.75rem] font-bold leading-tight">Convite para {familyName}</h1>
            <p className="mt-3 text-ink-2">
              {data.invited_by ? `${data.invited_by} convidou você` : 'Você foi convidado'} para compartilhar listas de
              compras, produtos e preços com a família.
              {data.expires_at && ` O convite vale até ${formatDate(data.expires_at)}.`}
            </p>
            {error && (
              <Notice tone="danger" className="mt-4">
                <span role="alert">{error}</span>
              </Notice>
            )}
            {status === 'signed_in' ? (
              <Button className="mt-6" size="lg" block loading={busy} onClick={() => void onAccept()}>
                Entrar na família
              </Button>
            ) : (
              <div className="mt-6 space-y-3">
                <ButtonLink to={`/criar-conta?next=${encodeURIComponent(next)}`} size="lg" block>
                  Criar conta e entrar
                </ButtonLink>
                <ButtonLink to={`/entrar?next=${encodeURIComponent(next)}`} variant="secondary" size="lg" block>
                  Já tenho conta
                </ButtonLink>
              </div>
            )}
          </>
        )
        break
      case 'already_member':
        content = (
          <>
            <h1 className="text-[1.75rem] font-bold leading-tight">Você já está em {familyName}</h1>
            <Button
              className="mt-6"
              size="lg"
              block
              onClick={() => {
                if (data.family_id) setActiveFamily(data.family_id)
                navigate('/', { replace: true })
              }}
            >
              Abrir o app
            </Button>
          </>
        )
        break
      default: {
        const messages: Record<string, string> = {
          expired: 'Este convite expirou. Peça um novo link para quem convidou você.',
          revoked: 'Este convite foi cancelado. Peça um novo link para quem convidou você.',
          used: 'Este convite já foi usado. Peça um novo link para quem convidou você.',
          invalid: 'Não encontramos este convite. Confira se o link foi copiado inteiro.',
        }
        content = (
          <>
            <h1 className="text-[1.75rem] font-bold leading-tight">Convite indisponível</h1>
            <p className="mt-3 text-ink-2">{messages[data.status] ?? messages.invalid}</p>
            <ButtonLink to="/" variant="secondary" className="mt-6" block size="lg">
              Ir para o início
            </ButtonLink>
          </>
        )
      }
    }
  }

  return (
    <div className="safe-top min-h-dvh px-5 pb-12 pt-8">
      <div className="mx-auto w-full max-w-md">
        <BrandLockup />
        <div className="mt-10">{content}</div>
      </div>
    </div>
  )
}
