import { useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { BrandLockup } from '@/app/Brand'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { Notice } from '@/components/ui/States'
import { errorMessage } from '@/lib/errors'
import { firstName } from '@/lib/format'
import { useAuth, useUser } from '@/modules/auth/AuthProvider'
import { createFamily } from './api'
import { useFamily } from './FamilyProvider'

/** Extrai o token de um link de convite colado (ou aceita o token puro). */
export function extractInviteToken(text: string): string | null {
  const value = text.trim()
  if (!value) return null
  const match = /\/convite\/([A-Za-z0-9_-]{20,128})/.exec(value)
  if (match) return match[1]!
  return /^[A-Za-z0-9_-]{20,128}$/.test(value) ? value : null
}

export function OnboardingPage() {
  const user = useUser()
  const { signOut } = useAuth()
  const { memberships, nameOf, setActiveFamily, refetch } = useFamily()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [familyName, setFamilyName] = useState('')
  const [inviteText, setInviteText] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (memberships.length > 0 && !busy) return <Navigate to="/" replace />

  const name = firstName(nameOf(user.id, { you: false }))

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    if (!familyName.trim()) {
      setNameError('Dê um nome para a família, por exemplo "Família Costa".')
      return
    }
    setBusy(true)
    setNameError(null)
    try {
      const id = await createFamily(familyName)
      setActiveFamily(id)
      await queryClient.invalidateQueries({ queryKey: ['families'] })
      await refetch()
      navigate('/', { replace: true })
    } catch (e) {
      setNameError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  function onJoin(event: FormEvent) {
    event.preventDefault()
    const token = extractInviteToken(inviteText)
    if (!token) {
      setInviteError('Cole o link de convite completo que você recebeu.')
      return
    }
    navigate(`/convite/${token}`)
  }

  return (
    <div className="safe-top min-h-dvh px-5 pb-12 pt-8">
      <div className="mx-auto w-full max-w-md">
        <BrandLockup />
        <h1 className="mt-10 text-[1.75rem] font-bold leading-tight">
          {name && name !== 'Você' ? `Olá, ${name}!` : 'Boas-vindas!'}
        </h1>
        <p className="mt-2 text-ink-2">
          As listas, os produtos e os preços ficam no espaço da família, visíveis só para quem for convidado.
        </p>

        <section className="mt-8 rounded-[var(--radius-panel)] bg-card p-5 ring-1 ring-line">
          <h2 className="text-lg font-bold">Criar a família</h2>
          <p className="mt-1 text-ink-2">Você será o administrador e poderá convidar os demais.</p>
          <form onSubmit={onCreate} className="mt-4 space-y-4" noValidate>
            <TextField
              label="Nome da família"
              placeholder="Família Costa"
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              error={nameError}
              maxLength={60}
            />
            <Button type="submit" block size="lg" loading={busy}>
              Criar família
            </Button>
          </form>
        </section>

        <section className="mt-5 rounded-[var(--radius-panel)] bg-card p-5 ring-1 ring-line">
          <h2 className="text-lg font-bold">Recebi um convite</h2>
          <p className="mt-1 text-ink-2">Abra o link que chegou para você ou cole-o aqui.</p>
          <form onSubmit={onJoin} className="mt-4 space-y-4" noValidate>
            <TextField
              label="Link do convite"
              placeholder="https://…/convite/…"
              value={inviteText}
              onChange={(e) => setInviteText(e.target.value)}
              error={inviteError}
              autoComplete="off"
            />
            <Button type="submit" variant="secondary" block size="lg">
              Abrir convite
            </Button>
          </form>
        </section>

        <Notice className="mt-5">
          Entrou com a conta errada?{' '}
          <button type="button" className="font-semibold text-pen underline" onClick={() => void signOut()}>
            Sair
          </button>
        </Notice>
      </div>
    </div>
  )
}
